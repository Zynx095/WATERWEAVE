"""Engine calls and JSON conversion for the WATERWEAVE API.

Nothing in this module computes an objective, a metric or an allocation of
its own. It converts requests into ``Scenario`` objects, calls the engine,
and turns the results into JSON-safe dictionaries. A solver that fails is
reported as failed; its result is never replaced by another solver's.
"""

from __future__ import annotations

import json
import math
import os
import platform
import threading
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import scipy

from waterweave.api.schemas import ScenarioIn, SolveSettings
from waterweave.data import ScenarioBuilder, registry
from waterweave.formulation import (
    OptimizationModel,
    build_model,
    compute_default_penalty_weight,
    decode_allocation,
    evaluate_objective,
)
from waterweave.metrics import evaluate_allocation
from waterweave.models import Neighborhood, Scenario, SolverResult
from waterweave.optimization import run_comparison
from waterweave.scenarios import default_scenario

try:
    import qiskit

    QISKIT_VERSION: str | None = getattr(qiskit, "__version__", "unknown")
except ImportError:  # pragma: no cover - qiskit is a hard dependency
    QISKIT_VERSION = None

# Live QAOA statevector simulation above this size takes longer than a
# presentation can wait (measured: 0.45 s at 12 qubits, 3.9 s at 15, more
# than a minute at 18 for p = 1).
MAX_QAOA_QUBITS = 15

# Providers that need the network. With live=False they are skipped and
# reported as skipped, never replaced by invented values.
NETWORK_PROVIDERS = frozenset({"open_meteo"})

SOLVER_KEYS = {
    "Greedy (Priority-First)": "greedy",
    "Exact Classical (Optimal)": "exact",
    "QAOA (Quantum Heuristic)": "qaoa",
}

_SOLVE_LOCK = threading.Lock()


class SolverBusyError(RuntimeError):
    """Raised when another solver run holds the lock for too long."""


def utc_now() -> datetime:
    return datetime.now(UTC)


def json_safe(value: Any) -> Any:
    """Convert numpy scalars, tuples and non-finite floats into JSON values."""
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    if isinstance(value, np.ndarray):
        return [json_safe(v) for v in value.tolist()]
    if isinstance(value, (bool, np.bool_)):
        return bool(value)
    if isinstance(value, (int, np.integer)):
        return int(value)
    if isinstance(value, (float, np.floating)):
        f = float(value)
        return f if math.isfinite(f) else None
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def repo_root() -> Path:
    override = os.environ.get("WATERWEAVE_REPO_ROOT")
    if override:
        return Path(override).resolve()
    # src/waterweave/api/service.py -> repository root
    return Path(__file__).resolve().parents[3]


def offline_mode() -> bool:
    return os.environ.get("WATERWEAVE_OFFLINE", "").strip().lower() in {"1", "true", "yes"}


def engine_info() -> dict[str, Any]:
    return {
        "python": platform.python_version(),
        "qiskit": QISKIT_VERSION,
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "max_qaoa_qubits": MAX_QAOA_QUBITS,
    }


# ---- scenarios -----------------------------------------------------------

def scenario_from_input(data: ScenarioIn) -> Scenario:
    slots = tuple(data.slots)
    neighborhoods = tuple(
        Neighborhood(
            id=n.id,
            name=n.name,
            demand_by_slot={s: int(n.demand_by_slot.get(s, 0)) for s in slots},
            priority_weight=float(n.priority_weight),
            storage_capacity_units=int(n.storage_capacity_units),
        )
        for n in data.neighborhoods
    )
    return Scenario(
        name=data.name,
        slots=slots,
        neighborhoods=neighborhoods,
        supply_by_slot={s: int(data.supply_by_slot.get(s, 0)) for s in slots},
        description=data.description,
        seed=data.seed,
    )


def scenario_to_dict(scenario: Scenario) -> dict[str, Any]:
    return {
        "name": scenario.name,
        "description": scenario.description,
        "slots": list(scenario.slots),
        "supply_by_slot": {s: int(scenario.supply_by_slot.get(s, 0)) for s in scenario.slots},
        "neighborhoods": [
            {
                "id": n.id,
                "name": n.name,
                "demand_by_slot": {s: int(n.demand_by_slot.get(s, 0)) for s in scenario.slots},
                "priority_weight": float(n.priority_weight),
                "storage_capacity_units": int(n.storage_capacity_units),
            }
            for n in scenario.neighborhoods
        ],
        "seed": int(scenario.seed),
    }


# ---- model and circuit ---------------------------------------------------

def model_summary(model: OptimizationModel) -> dict[str, Any]:
    return {
        "n_decision": model.n_decision,
        "n_slack": model.n_slack,
        "n_vars": model.n_vars,
        "fairness_weight": float(model.fairness_weight),
        "penalty_weight": float(model.penalty_weight),
        "decision_vars": [
            {"index": k, "neighborhood_id": nid, "slot": slot, "name": model.var_names[k]}
            for k, (nid, slot) in enumerate(model.decision_vars)
        ],
        "slack_vars": [
            {"index": model.n_decision + j, "name": name} for j, name in enumerate(model.slack_vars)
        ],
        "qaoa_within_budget": model.n_vars <= MAX_QAOA_QUBITS,
        "max_qaoa_qubits": MAX_QAOA_QUBITS,
    }


def _nonzero_pairs(matrix: np.ndarray) -> list[list[float]]:
    n = matrix.shape[0]
    return [
        [k, l, float(matrix[k, l])]
        for k in range(n)
        for l in range(k + 1, n)
        if abs(matrix[k, l]) > 1e-12
    ]


def model_details(model: OptimizationModel) -> dict[str, Any]:
    """Model summary plus QUBO and Ising coefficients and circuit structure."""
    details = model_summary(model)
    details["qubo"] = {
        "offset": float(model.offset),
        "linear": [float(c) for c in model.linear_coeffs],
        "quadratic": _nonzero_pairs(model.quadratic_matrix),
    }
    details["ising"] = {
        "offset": float(model.ising_offset),
        "h": [float(h) for h in model.ising_h],
        "J": _nonzero_pairs(model.ising_J),
    }
    structure = []
    for p in (1, 2, 3):
        if model.n_vars == 0:
            break
        # Gate structure does not depend on the angle values; the optimiser
        # chooses the angles at run time.
        qc = _circuit(model, [0.5] * p, [0.5] * p)
        structure.append({"p": p, "depth": qc.depth(), "gate_counts": dict(qc.count_ops())})
    details["circuit_structure"] = structure
    return details


def _circuit(model: OptimizationModel, gammas: list[float], betas: list[float]):
    from waterweave.solvers import _build_qaoa_circuit

    return _build_qaoa_circuit(model, gammas, betas)


def circuit_details(model: OptimizationModel, gammas: list[float], betas: list[float]) -> dict[str, Any]:
    """Rebuild the executed QAOA circuit from the reported angles."""
    qc = _circuit(model, gammas, betas)
    gates = []
    for instruction in qc.data:
        op = instruction.operation
        gates.append(
            {
                "name": op.name,
                "qubits": [qc.find_bit(q).index for q in instruction.qubits],
                "params": [float(p) for p in op.params],
            }
        )
    return {
        "num_qubits": qc.num_qubits,
        "depth": qc.depth(),
        "gate_counts": dict(qc.count_ops()),
        "layers": len(gammas),
        "gammas": [float(g) for g in gammas],
        "betas": [float(b) for b in betas],
        "gates": gates,
    }


# ---- solving -------------------------------------------------------------

def _decode_bits(model: OptimizationModel, bitstring: str | None) -> dict[str, Any] | None:
    """Split a Qiskit (little-endian) bitstring into decision and slack bits."""
    if not bitstring:
        return None
    bits = [int(ch) for ch in reversed(bitstring)]
    return {
        "bitstring": bitstring,
        "decision_bits": bits[: model.n_decision],
        "slack_bits": bits[model.n_decision :],
        "allocation": decode_allocation(model, bitstring),
    }


def _outcome(
    result: SolverResult,
    scenario: Scenario,
    model: OptimizationModel,
    exact_objective: float | None,
) -> dict[str, Any]:
    key = SOLVER_KEYS.get(result.solver_name, result.solver_name)
    metadata = dict(result.metadata or {})
    error = metadata.get("error")
    objective = result.objective_value if math.isfinite(result.objective_value) else None
    failed = error is not None or objective is None
    outcome: dict[str, Any] = {
        "key": key,
        "solver_name": result.solver_name,
        "status": "error" if failed else "ok",
        "error": (error or "The solver returned no finite objective value.") if failed else None,
        # A failed run's placeholder allocation is not a result; do not show it.
        "allocation": None if failed else result.allocation,
        "objective_value": None if failed else objective,
        "feasible": False if failed else bool(result.feasible),
        "metrics": None if failed else result.metrics,
        "runtime_seconds": float(result.runtime_seconds),
        "gap_to_exact": None,
        "metadata": metadata,
        "circuit": None,
        "samples": None,
    }
    if not failed and exact_objective is not None:
        outcome["gap_to_exact"] = objective - exact_objective
    if key == "qaoa" and not failed:
        gammas = metadata.get("optimal_gammas")
        betas = metadata.get("optimal_betas")
        if gammas and betas:
            outcome["circuit"] = circuit_details(model, list(gammas), list(betas))
        outcome["samples"] = {
            "best": _decode_bits(model, metadata.get("best_bitstring")),
            "modal": _decode_bits(model, metadata.get("modal_bitstring")),
        }
    return json_safe(outcome)


def reference_outcomes(scenario: Scenario, fairness_weight: float, penalty_weight: float) -> dict[str, Any]:
    """Score the 'deliver nothing' allocation with the shared objective and metrics.

    Shown next to solver results so a fairness score of 1.0 is not mistaken
    for a good allocation.
    """
    empty = {n.id: {s: 0 for s in scenario.slots} for n in scenario.neighborhoods}
    return json_safe(
        {
            "deliver_nothing": {
                "allocation": empty,
                "objective_value": evaluate_objective(
                    scenario, empty, fairness_weight=fairness_weight, penalty_weight=penalty_weight
                ),
                "metrics": evaluate_allocation(scenario, empty),
            }
        }
    )


def solve(scenario: Scenario, settings: SolveSettings, lock_timeout: float = 30.0) -> dict[str, Any]:
    """Run ``run_comparison`` and describe every result, including failures."""
    penalty = (
        settings.penalty_weight
        if settings.penalty_weight is not None
        else compute_default_penalty_weight(scenario, fairness_weight=settings.fairness_weight)
    )
    model = build_model(scenario, fairness_weight=settings.fairness_weight, penalty_weight=penalty)
    run_qaoa = settings.include_qaoa and model.n_vars <= MAX_QAOA_QUBITS
    seed = scenario.seed if settings.seed is None else settings.seed

    if not _SOLVE_LOCK.acquire(timeout=lock_timeout):
        raise SolverBusyError("Another solver run is still in progress. Try again in a moment.")
    try:
        started = time.perf_counter()
        results = run_comparison(
            scenario,
            include_qaoa=run_qaoa,
            fairness_weight=settings.fairness_weight,
            penalty_weight=penalty,
            shots=settings.shots,
            p=settings.p,
            maxiter=settings.maxiter,
            seed=seed,
        )
        wall = time.perf_counter() - started
    finally:
        _SOLVE_LOCK.release()

    exact = next((r for r in results if SOLVER_KEYS.get(r.solver_name) == "exact"), None)
    exact_objective = (
        exact.objective_value
        if exact is not None and math.isfinite(exact.objective_value) and exact.feasible
        else None
    )
    outcomes = [_outcome(r, scenario, model, exact_objective) for r in results]

    if settings.include_qaoa and not run_qaoa:
        outcomes.append(
            {
                "key": "qaoa",
                "solver_name": "QAOA (Quantum Heuristic)",
                "status": "skipped",
                "error": (
                    f"Not run: this scenario needs {model.n_vars} qubits "
                    f"({model.n_decision} decisions + {model.n_slack} slack). Live statevector "
                    f"simulation is limited to {MAX_QAOA_QUBITS} qubits so results return in seconds."
                ),
                "allocation": None,
                "objective_value": None,
                "feasible": False,
                "metrics": None,
                "runtime_seconds": 0.0,
                "gap_to_exact": None,
                "metadata": {},
                "circuit": None,
                "samples": None,
            }
        )

    return json_safe(
        {
            "run_id": uuid.uuid4().hex[:12],
            "executed_at": utc_now(),
            "source": "live",
            "scenario": scenario_to_dict(scenario),
            "settings": {
                "include_qaoa": settings.include_qaoa,
                "fairness_weight": settings.fairness_weight,
                "penalty_weight": penalty,
                "penalty_weight_was_default": settings.penalty_weight is None,
                "p": settings.p,
                "shots": settings.shots,
                "maxiter": settings.maxiter,
                "seed": seed,
            },
            "model": model_summary(model),
            "results": outcomes,
            "reference": reference_outcomes(scenario, settings.fairness_weight, penalty),
            "wall_seconds": wall,
            "engine": engine_info(),
        }
    )


def evaluate(
    scenario: Scenario,
    allocation: dict[str, dict[str, int]],
    fairness_weight: float,
    penalty_weight: float | None,
) -> dict[str, Any]:
    """Score any allocation with the shared metrics and the solvers' objective."""
    penalty = (
        penalty_weight
        if penalty_weight is not None
        else compute_default_penalty_weight(scenario, fairness_weight=fairness_weight)
    )
    return json_safe(
        {
            "metrics": evaluate_allocation(scenario, allocation),
            "objective_value": evaluate_objective(
                scenario, allocation, fairness_weight=fairness_weight, penalty_weight=penalty
            ),
            "fairness_weight": fairness_weight,
            "penalty_weight": penalty,
        }
    )


# ---- data provenance -----------------------------------------------------

def _observation_dict(obs, now: datetime, request_started: datetime) -> dict[str, Any]:
    try:
        identity = registry.get_provider(obs.provider_id).identity
        provider = {
            "id": identity.id,
            "name": identity.name,
            "organization": identity.organization,
            "url": identity.url,
        }
    except KeyError:
        provider = {"id": obs.provider_id, "name": obs.provider_id, "organization": "", "url": ""}
    source_age = (now - obs.source_timestamp).total_seconds() if obs.source_timestamp else None
    retrieval_age = (now - obs.retrieval_timestamp).total_seconds()
    return {
        "provider": provider,
        "dataset_id": obs.dataset_id,
        "geographic_level": obs.geographic_level,
        "geographic_id": obs.geographic_id,
        "variable": obs.variable,
        "value": obs.value,
        "unit": obs.unit,
        "source_timestamp": obs.source_timestamp,
        "retrieval_timestamp": obs.retrieval_timestamp,
        "source_age_seconds": source_age,
        "retrieval_age_seconds": retrieval_age,
        # The provider's in-memory TTL cache returns the earlier retrieval
        # unchanged, so a retrieval older than this request means "cached".
        "served_from_cache": obs.retrieval_timestamp < request_started,
        "quality": {
            "status": obs.quality.status,
            "missing": obs.quality.missing,
            "error_details": obs.quality.error_details,
        },
    }


def data_sources(live: bool) -> dict[str, Any]:
    """Fetch observations and explain how they would enter a scenario."""
    forced_offline = offline_mode()
    live = live and not forced_offline
    request_started = utc_now()
    observations = []
    skipped = []
    for provider in registry.get_all():
        pid = provider.identity.id
        if pid in NETWORK_PROVIDERS and not live:
            skipped.append(
                {
                    "provider": {"id": pid, "name": provider.identity.name, "url": provider.identity.url},
                    "reason": (
                        "Offline mode (WATERWEAVE_OFFLINE is set)."
                        if forced_offline
                        else "Live fetch not requested."
                    ),
                }
            )
            continue
        try:
            observations.extend(provider.fetch())
        except Exception as exc:  # noqa: BLE001 - providers normally report errors themselves
            skipped.append(
                {
                    "provider": {"id": pid, "name": provider.identity.name, "url": provider.identity.url},
                    "reason": f"Provider raised {type(exc).__name__}: {exc}",
                }
            )
    now = utc_now()

    builder = ScenarioBuilder()
    built = builder.build(observations)
    base = default_scenario()
    base_weights = {n.id: n.priority_weight for n in base.neighborhoods}
    weight_changes = [
        {"id": n.id, "default": base_weights.get(n.id), "data_informed": n.priority_weight}
        for n in built.neighborhoods
        if base_weights.get(n.id) != n.priority_weight
    ]
    supply_changed = dict(built.supply_by_slot) != dict(base.supply_by_slot)

    return json_safe(
        {
            "requested_live": live,
            "offline_mode": forced_offline,
            "fetched_at": now,
            "observations": [_observation_dict(o, now, request_started) for o in observations],
            "skipped": skipped,
            "scenario_effect": {
                "rainfall_heuristic_enabled": builder.apply_hypothetical_rainfall_heuristic,
                "supply_changed": supply_changed,
                "supply_by_slot": dict(built.supply_by_slot),
                "default_supply_by_slot": dict(base.supply_by_slot),
                "priority_weight_changes": weight_changes,
            },
        }
    )


# ---- recorded benchmark --------------------------------------------------

def load_benchmark() -> dict[str, Any] | None:
    """Return the committed benchmark summaries, or None if they are absent."""
    folder = repo_root() / "benchmark_results"
    out: dict[str, Any] = {}
    for instance in ("default", "small"):
        path = folder / f"benchmark_{instance}.json"
        if not path.is_file():
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        meta = payload.get("meta") or {}
        audit = payload.get("audit") or {}  # null when the run used --skip-audit
        out[instance] = {
            "file": f"benchmark_results/{path.name}",
            "instance": meta.get("instance"),
            "timestamp_utc": meta.get("timestamp_utc"),
            "synthetic_notice": meta.get("synthetic_notice"),
            "parameters": {
                k: meta.get(k)
                for k in ("fairness_weight", "penalty_weight", "shots", "maxiter", "seeds", "p_values")
            },
            "exact_optimum_objective": meta.get("exact_optimum_objective_independent"),
            "seed_note": meta.get("seed_note"),
            "provenance": meta.get("provenance") or {},
            "summary": payload.get("summary") or [],
            "audit_checks": [
                {"name": c.get("name"), "status": c.get("status"), "detail": c.get("detail")}
                for c in audit.get("checks") or []
            ],
            # Facts from exhaustive enumeration (e.g. number of optimal plans,
            # probability that a uniform sample is optimal).
            "audit_facts": audit.get("facts") or {},
            "limitations": payload.get("limitations") or [],
        }
    return json_safe(out) if out else None
