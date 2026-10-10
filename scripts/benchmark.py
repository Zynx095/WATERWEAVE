#!/usr/bin/env python
"""WATERWEAVE reproducible benchmark and formulation audit.

Runs the documented ``waterweave.optimization.run_comparison`` entry point
(greedy, exact classical, QAOA) on one SYNTHETIC scenario for several QAOA
depths and seeds, audits the shared objective against an independent
re-implementation, and writes CSV + JSON files containing only values that
were actually measured. It never substitutes a classical answer for QAOA: a
missing or failed QAOA result is recorded as an error and the exit code is
non-zero.

Exit codes: 0 success, 2 engine unavailable (nothing written),
3 at least one QAOA run failed or was not returned (outputs still written),
4 audit check failed (outputs still written).

No quantum advantage is claimed or tested here.
"""

from __future__ import annotations

import argparse
import csv
import dataclasses
import datetime as _dt
import inspect
import itertools
import json
import math
import platform
import statistics
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
TOL = 1e-9
RANDOM_CONTROL_NAME = "Uniform random sampling (shot-matched control)"
SYNTHETIC_NOTICE = (
    "All scenario data is SYNTHETIC. Nothing here is live or measured "
    "municipal data and no claim is made about any real water network."
)
LIMITATIONS = [
    "Single tiny synthetic instance (7 decision bits, 12 qubits with slack): "
    "results do not generalise and are not evidence of quantum advantage.",
    "QAOA is run by noiseless statevector simulation on a classical computer; "
    "its runtime is simulation cost, not hardware runtime.",
    "The exact solver enumerates 2^7 decision patterns; QAOA works in a "
    "2^12 space with slack qubits. Runtimes are not a like-for-like comparison.",
    "The engine reports the best sampled feasible bitstring (classical "
    "post-selection over shots), not the modal one. Modal results are "
    "reported separately.",
    "In the engine, the seed controls only shot sampling; parameter "
    "optimisation is deterministic, so seed variability understates "
    "optimiser-initialisation variability.",
]


# --------------------------------------------------------------------------
# Engine import and provenance
# --------------------------------------------------------------------------

def _import_engine() -> dict[str, Any]:
    """Import the engine lazily; return handles or raise RuntimeError."""
    try:
        import waterweave  # noqa: F401
    except ImportError:
        src = ROOT / "src"
        if src.is_dir() and str(src) not in sys.path:
            sys.path.insert(0, str(src))
    try:
        from waterweave import optimization
        from waterweave.scenarios import default_scenario
        from waterweave.metrics import evaluate_allocation
    except ImportError as exc:
        raise RuntimeError(
            f"Required WATERWEAVE module unavailable ({exc}). "
            "waterweave.optimization.run_comparison is the documented "
            "solver entry point (docs/INTERFACES.md); it is not on this "
            "branch. Point PYTHONPATH at a checkout that contains it, e.g. "
            "PYTHONPATH=<path-to-engine-checkout>/src."
        ) from exc
    handles: dict[str, Any] = {
        "run_comparison": getattr(optimization, "run_comparison", None),
        "default_scenario": default_scenario,
        "evaluate_allocation": evaluate_allocation,
    }
    if handles["run_comparison"] is None:
        raise RuntimeError(
            "waterweave.optimization has no run_comparison (INTERFACES.md)."
        )
    try:  # optional, documented in docs/FORMULATION.md of the engine branch
        from waterweave import formulation
        handles["formulation"] = formulation
    except ImportError:
        handles["formulation"] = None
    return handles


def _git(args: list[str], cwd: Path) -> str | None:
    try:
        out = subprocess.run(
            ["git", *args], cwd=cwd, capture_output=True, text=True, timeout=20
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout.strip() if out.returncode == 0 else None


def provenance(handles: dict[str, Any]) -> dict[str, Any]:
    try:
        mod_dir = Path(inspect.getfile(handles["run_comparison"])).resolve().parent
    except (TypeError, OSError):
        mod_dir = ROOT
    info: dict[str, Any] = {
        "engine_module_path": str(mod_dir),
        "engine_git_commit": _git(["rev-parse", "HEAD"], mod_dir),
        "engine_git_branch": _git(["rev-parse", "--abbrev-ref", "HEAD"], mod_dir),
        "engine_tree_dirty": bool(_git(["status", "--porcelain"], mod_dir)),
        "benchmark_git_commit": _git(["rev-parse", "HEAD"], ROOT),
        "python": platform.python_version(),
        "platform": platform.platform(),
        "numpy": np.__version__,
    }
    for mod in ("qiskit", "scipy"):
        try:
            info[mod] = __import__(mod).__version__
        except Exception:  # noqa: BLE001 - report absence, do not guess
            info[mod] = None
    return info


# --------------------------------------------------------------------------
# Instances
# --------------------------------------------------------------------------

def build_instance(handles: dict[str, Any], name: str, seed: int):
    sc = handles["default_scenario"](seed)
    if name == "default":
        return sc
    if name == "small":
        keep = tuple(n for n in sc.neighborhoods if n.id in ("N2", "N3", "N4"))
        return dataclasses.replace(
            sc,
            name="synthetic-3x2-small",
            neighborhoods=keep,
            supply_by_slot={t: 1 for t in sc.slots},
            description=(
                "SYNTHETIC reduced instance derived from the default "
                "scenario for exact-enumeration checks (3 neighborhoods, "
                "1 unit of supply per slot). Not real data."
            ),
        )
    raise ValueError(f"unknown instance {name!r}")


# --------------------------------------------------------------------------
# Independent objective (audit): written from docs/PROJECT_SPEC.md and
# docs/FORMULATION.md definitions, deliberately NOT importing engine code.
# --------------------------------------------------------------------------

def eligible_variables(sc) -> list[tuple[str, str]]:
    """Binary decisions exist only where demand exists (PROJECT_SPEC.md)."""
    return [
        (n.id, t)
        for n in sc.neighborhoods
        for t in sc.slots
        if n.demand_by_slot.get(t, 0) > 0
    ]


def bits_to_allocation(sc, variables, bits) -> dict[str, dict[str, int]]:
    alloc = {n.id: {t: 0 for t in sc.slots} for n in sc.neighborhoods}
    for (nid, t), b in zip(variables, bits):
        alloc[nid][t] = int(b)
    return alloc


def audit_terms(sc, alloc) -> dict[str, float]:
    """Weighted shortage, disparity (sum of pairwise squared service-level
    differences), squared-violation sum, and feasibility, from first
    principles. Over-allocation earns no service."""
    shortage = 0.0
    levels = []
    viol_sq = 0.0
    feasible = True
    for n in sc.neighborhoods:
        demand = sum(n.demand_by_slot.get(t, 0) for t in sc.slots)
        got = sum(alloc.get(n.id, {}).get(t, 0) for t in sc.slots)
        served = sum(
            min(alloc.get(n.id, {}).get(t, 0), n.demand_by_slot.get(t, 0))
            for t in sc.slots
        )
        shortage += n.priority_weight * (demand - served)
        if demand > 0:
            levels.append(served / demand)
        for t in sc.slots:
            over = alloc.get(n.id, {}).get(t, 0) - n.demand_by_slot.get(t, 0)
            if over > 0:
                viol_sq += over ** 2
                feasible = False
        over = got - n.storage_capacity_units
        if over > 0:
            viol_sq += over ** 2
            feasible = False
    for t in sc.slots:
        used = sum(alloc.get(n.id, {}).get(t, 0) for n in sc.neighborhoods)
        over = used - sc.supply_by_slot.get(t, 0)
        if over > 0:
            viol_sq += over ** 2
            feasible = False
    disparity = sum(
        (a - b) ** 2 for a, b in itertools.combinations(levels, 2)
    )
    return {
        "shortage": shortage,
        "disparity": disparity,
        "violation_sq": viol_sq,
        "feasible": feasible,
    }


def audit_objective(terms: dict[str, float], alpha: float, penalty: float) -> float:
    return terms["shortage"] + alpha * terms["disparity"] + penalty * terms["violation_sq"]


def enumerate_instance(sc, alpha: float, penalty: float) -> dict[str, Any]:
    """Exhaustive enumeration over all 2^K decision patterns."""
    variables = eligible_variables(sc)
    states = []
    for bits in itertools.product((0, 1), repeat=len(variables)):
        alloc = bits_to_allocation(sc, variables, bits)
        terms = audit_terms(sc, alloc)
        states.append(
            {
                "bits": bits,
                "objective": audit_objective(terms, alpha, penalty),
                **terms,
            }
        )
    return {"variables": variables, "states": states}


def serve_nobody_threshold(states: list[dict[str, Any]]) -> float | None:
    """Smallest alpha at which serving nobody is an optimal feasible
    allocation (>= it; strictly beyond it, nobody-served is the unique
    optimum). Returns None when no feasible state has positive disparity."""
    empty = next((s for s in states if sum(s["bits"]) == 0 and s["feasible"]), None)
    if empty is None:
        return None
    ratios = [
        (empty["shortage"] - s["shortage"]) / s["disparity"]
        for s in states
        if s["feasible"] and s["disparity"] > TOL and s["shortage"] < empty["shortage"]
    ]
    return max(ratios) if ratios else None


# --------------------------------------------------------------------------
# Independent QAOA state analysis (numpy), from reported angles
# --------------------------------------------------------------------------

def energy_vector(model) -> np.ndarray:
    n = model.n_vars
    idx = np.arange(2 ** n)
    bits = ((idx[:, None] >> np.arange(n)) & 1).astype(float)
    return (
        model.offset
        + bits @ model.linear_coeffs
        + np.sum((bits @ model.quadratic_matrix) * bits, axis=1)
    )


def qaoa_probabilities(energy: np.ndarray, n: int, gammas, betas) -> np.ndarray:
    """|+>^n, then per layer exp(-i gamma H_C) and prod_k exp(-i beta X_k).

    Independent of the engine's circuit; basis index bit k <-> qubit k."""
    psi = np.full(2 ** n, 2 ** (-n / 2), dtype=complex)
    for g, b in zip(gammas, betas):
        psi = psi * np.exp(-1j * g * energy)
        t = psi.reshape([2] * n)
        c, s = math.cos(b), -1j * math.sin(b)
        for ax in range(n):
            # reshape puts the most significant qubit on axis 0
            t0 = np.take(t, 0, axis=ax)
            t1 = np.take(t, 1, axis=ax)
            t = np.stack([c * t0 + s * t1, s * t0 + c * t1], axis=ax)
        psi = t.reshape(-1)
    return np.abs(psi) ** 2


# --------------------------------------------------------------------------
# Audit of the shared formulation
# --------------------------------------------------------------------------

def run_audit(sc, handles, alpha, penalty, enum) -> dict[str, Any]:
    states = enum["states"]
    feas = [s for s in states if s["feasible"]]
    infeas = [s for s in states if not s["feasible"]]
    audit: dict[str, Any] = {"checks": [], "facts": {}}

    def check(name: str, ok: bool | None, detail: str) -> None:
        audit["checks"].append(
            {"name": name, "status": "skipped" if ok is None else ("pass" if ok else "FAIL"),
             "detail": detail}
        )

    best = min(feas, key=lambda s: s["objective"]) if feas else None
    ties = [s for s in feas if best and abs(s["objective"] - best["objective"]) <= TOL]
    best_inf = min((s["objective"] for s in infeas), default=None)
    audit["facts"].update(
        {
            "n_decision_vars": len(enum["variables"]),
            "n_states": len(states),
            "n_feasible_states": len(feas),
            "optimal_objective": best["objective"] if best else None,
            "n_optimal_ties": len(ties),
            "uniform_p_feasible_pattern": len(feas) / len(states),
            "uniform_p_optimal_pattern": len(ties) / len(states),
            "best_infeasible_objective": best_inf,
            "penalty_margin": (best_inf - best["objective"]) if best and best_inf is not None else None,
            "alpha": alpha,
            "penalty_weight": penalty,
            "serve_nobody_alpha_threshold": serve_nobody_threshold(states),
            "unpenalised_best_is_infeasible": bool(
                min(states, key=lambda s: s["shortage"] + alpha * s["disparity"])["feasible"] is False
            ),
        }
    )
    if best_inf is not None and best:
        check(
            "penalty_dominance",
            best_inf > best["objective"] + TOL,
            f"best infeasible objective {best_inf:.4f} vs optimum "
            f"{best['objective']:.4f} (margin {best_inf - best['objective']:.4f}); "
            "checked by exhaustive enumeration, not by the analytical bound",
        )

    # fairness_score (range) vs variance-style disparity ranking
    fs = []
    for s in feas:
        alloc = bits_to_allocation(sc, enum["variables"], s["bits"])
        levels = []
        for n in sc.neighborhoods:
            d = sum(n.demand_by_slot.get(t, 0) for t in sc.slots)
            if d > 0:
                levels.append(sum(alloc[n.id].values()) / d)
        fs.append(1.0 - (max(levels) - min(levels)) if levels else 1.0)
    if len(feas) <= 2000:
        inverted = sum(
            1
            for i, j in itertools.combinations(range(len(feas)), 2)
            if (fs[i] - fs[j]) * (feas[j]["disparity"] - feas[i]["disparity"]) < -TOL
        )
        audit["facts"]["fairness_vs_disparity_inverted_pairs"] = inverted
        audit["facts"]["feasible_pairs_compared"] = len(feas) * (len(feas) - 1) // 2
    if best:
        i_best = feas.index(best)
        audit["facts"]["optimum_fairness_score"] = fs[i_best]
        audit["facts"]["max_feasible_fairness_score"] = max(fs)
        audit["facts"]["fairness_score_of_serving_nobody"] = next(
            (fs[k] for k, s in enumerate(feas) if sum(s["bits"]) == 0), None
        )

    # alpha sensitivity (same states, independent objective)
    sens = []
    for a in (0.0, 0.5, 1.0, 2.0, 4.0, 8.0):
        b = min(feas, key=lambda s: s["shortage"] + a * s["disparity"])
        sens.append(
            {
                "alpha": a,
                "units_served": int(sum(b["bits"])),
                "weighted_shortage": b["shortage"],
                "disparity": b["disparity"],
            }
        )
    audit["facts"]["alpha_sensitivity"] = sens

    # Cross-checks against engine formulation (if importable)
    f = handles.get("formulation")
    if f is None:
        check("engine_formulation_available", None, "waterweave.formulation not importable")
        return audit
    try:
        model = f.build_model(sc, fairness_weight=alpha, penalty_weight=penalty)
    except Exception as exc:  # noqa: BLE001
        check("engine_build_model", False, f"build_model raised {type(exc).__name__}: {exc}")
        return audit
    audit["facts"]["n_slack_vars"] = model.n_slack
    audit["facts"]["n_qubits"] = model.n_vars
    check(
        "variable_order_matches",
        list(model.decision_vars) == enum["variables"],
        f"engine decision_vars {list(model.decision_vars)}",
    )
    worst = 0.0
    for s in states:
        alloc = bits_to_allocation(sc, enum["variables"], s["bits"])
        eo = f.evaluate_objective(sc, alloc, fairness_weight=alpha, penalty_weight=penalty)
        worst = max(worst, abs(eo - s["objective"]))
    check(
        "engine_objective_matches_independent",
        worst <= 1e-7,
        f"max |engine - independent| over all {len(states)} states = {worst:.2e}",
    )
    if model.n_vars <= 20 and model.n_decision == len(enum["variables"]):
        energy = energy_vector(model)
        grid = energy.reshape(2 ** model.n_slack, 2 ** model.n_decision)
        min_over_slack = grid.min(axis=0)
        # engine bit k of the state index <-> variable k, so decision pattern
        # index uses the same little-endian packing
        diffs = []
        for s in states:
            code = sum(b << k for k, b in enumerate(s["bits"]))
            diffs.append(abs(min_over_slack[code] - s["objective"]))
        check(
            "qubo_min_over_slack_equals_objective",
            max(diffs) <= 1e-7,
            f"max deviation {max(diffs):.2e} over {len(states)} decision patterns "
            f"x {2 ** model.n_slack} slack settings",
        )
        # Ising diagonal vs QUBO energy
        if model.n_vars <= 14:
            try:
                op = f.to_sparse_pauli_op(model)
                diag = np.real(op.to_matrix(sparse=True).diagonal())
                check(
                    "ising_diagonal_equals_qubo_energy",
                    float(np.max(np.abs(diag - energy))) <= 1e-7,
                    f"max deviation {float(np.max(np.abs(diag - energy))):.2e} "
                    f"over {2 ** model.n_vars} basis states",
                )
            except Exception as exc:  # noqa: BLE001
                check("ising_diagonal_equals_qubo_energy", None, f"unavailable: {exc}")
        audit["facts"]["uniform_mean_energy"] = float(energy.mean())
        audit["facts"]["ground_energy"] = float(energy.min())
        audit["facts"]["max_abs_ising_h"] = float(np.max(np.abs(model.ising_h)))
        audit["facts"]["max_abs_ising_J"] = float(np.max(np.abs(model.ising_J)))
        # numpy re-simulation vs engine circuit (private helper; optional)
        try:
            from waterweave import solvers
            from qiskit.quantum_info import Statevector

            builder = solvers._build_qaoa_circuit  # noqa: SLF001
            rng = np.random.default_rng(0)
            gm, bt = list(rng.uniform(0, 1, 2)), list(rng.uniform(0, 1, 2))
            ref = Statevector.from_instruction(builder(model, gm, bt)).probabilities()
            mine = qaoa_probabilities(energy, model.n_vars, gm, bt)
            check(
                "independent_qaoa_simulation_matches_engine_circuit",
                float(np.max(np.abs(ref - mine))) <= 1e-9,
                f"max probability deviation {float(np.max(np.abs(ref - mine))):.2e} (p=2)",
            )
        except Exception as exc:  # noqa: BLE001
            check("independent_qaoa_simulation_matches_engine_circuit", None, f"unavailable: {exc}")
    return audit


# --------------------------------------------------------------------------
# Running and recording
# --------------------------------------------------------------------------

def _num(x: Any) -> float | None:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def is_qaoa(res) -> bool:
    return "qaoa" in str(res.solver_name).lower()


def make_row(res, *, run_index, p, seed, instance, enum, opt_obj, alpha, penalty,
             call_wall, sc, handles, model, energy, base_energy=None) -> dict[str, Any]:
    md = dict(res.metadata or {})
    m = res.metrics or {}
    qaoa = is_qaoa(res)
    error = md.get("error")
    status = "error" if error else "ok"
    if qaoa and not error and md.get("solver_type") != "quantum_approximate":
        status = "error"
        error = "result labelled QAOA lacks solver_type='quantum_approximate'"
    variables = enum["variables"]
    row: dict[str, Any] = {
        "run_index": run_index,
        "instance": instance,
        "solver_name": res.solver_name,
        "solver_type": md.get("solver_type", "control" if res.solver_name == RANDOM_CONTROL_NAME else None),
        "qaoa_p": p if qaoa else None,
        "seed": seed,
        "status": status,
        "error": error,
        "feasible": bool(res.feasible),
        "objective": _num(res.objective_value),
        "weighted_shortage": _num(m.get("weighted_shortage")),
        "service_level": _num(m.get("service_level")),
        "fairness_score": _num(m.get("fairness_score")),
        "total_allocated_units": _num(m.get("total_allocated_units")),
        "unmet_demand_units": _num(m.get("unmet_demand_units")),
        "runtime_seconds": _num(res.runtime_seconds),
        "call_wall_seconds": call_wall,
        "allocation": json.dumps(res.allocation, sort_keys=True),
    }
    # independent re-evaluation of the reported allocation
    terms = audit_terms(sc, res.allocation)
    ind = audit_objective(terms, alpha, penalty)
    row["audit_objective"] = ind
    row["audit_feasible"] = terms["feasible"]
    row["objective_delta_vs_audit"] = (
        abs(row["objective"] - ind) if row["objective"] is not None else None
    )
    row["audit_feasible_agrees"] = terms["feasible"] == row["feasible"]
    row["gap_to_exact"] = (
        row["objective"] - opt_obj if row["objective"] is not None and opt_obj is not None else None
    )
    row["approximation_ratio"] = (
        row["objective"] / opt_obj
        if row["objective"] is not None and opt_obj and opt_obj > TOL
        else None
    )
    row["hit_optimum"] = bool(
        row["feasible"] and row["gap_to_exact"] is not None and abs(row["gap_to_exact"]) <= 1e-6
    )
    if qaoa:
        keys = (
            "layers_p", "shots", "num_qubits", "circuit_depth", "optimizer",
            "optimizer_iterations", "sampled_unique_bitstrings",
            "feasible_samples_ratio", "modal_bitstring", "best_bitstring",
            "qubo_energy", "slack_consistent", "quantum_advantage_claimed",
        )
        for k in keys:
            row[f"qaoa_{k}"] = md.get(k)
        row["qaoa_optimal_gammas"] = json.dumps(md.get("optimal_gammas"))
        row["qaoa_optimal_betas"] = json.dumps(md.get("optimal_betas"))
        row["qaoa_missing_metadata"] = ",".join(k for k in keys if k not in md)
        # --- benchmark-derived (not reported by the engine) ---
        modal = md.get("modal_bitstring")
        n_dec = len(variables)
        if isinstance(modal, str) and len(modal) >= n_dec:
            bits = [int(c) for c in reversed(modal)][:n_dec]
            t = audit_terms(sc, bits_to_allocation(sc, variables, bits))
            row["derived_modal_feasible"] = t["feasible"]
            row["derived_modal_objective"] = audit_objective(t, alpha, penalty)
            row["derived_modal_allocation"] = json.dumps(bits_to_allocation(sc, variables, bits), sort_keys=True)
        g, b = md.get("optimal_gammas"), md.get("optimal_betas")
        if energy is not None and model is not None and g and b and len(g) == len(b):
            probs = qaoa_probabilities(energy, model.n_vars, g, b)
            n_dec = model.n_decision
            pat = np.arange(len(probs)) & (2 ** n_dec - 1)
            feas_mask = np.zeros(2 ** n_dec, dtype=bool)
            opt_mask = np.zeros(2 ** n_dec, dtype=bool)
            for s in enum["states"]:
                code = sum(bit << k for k, bit in enumerate(s["bits"]))
                feas_mask[code] = s["feasible"]
                opt_mask[code] = s["feasible"] and abs(s["objective"] - opt_obj) <= TOL
            row["derived_state_expected_energy"] = float(probs @ energy)
            row["derived_state_p_feasible"] = float(probs[feas_mask[pat]].sum())
            row["derived_state_p_optimal"] = float(probs[opt_mask[pat]].sum())
            # Penalty-phase diagnostics: with H_C's penalty energies being
            # integer multiples of P, a layer with gamma*P/(2*pi) near an
            # integer leaves constraint penalties (almost) invisible.
            row["derived_penalty_phase_distance"] = json.dumps(
                [abs(x * penalty / (2 * math.pi) - round(x * penalty / (2 * math.pi))) for x in g]
            )
            if base_energy is not None:
                pb = qaoa_probabilities(base_energy, model.n_vars, g, b)
                row["derived_state_p_feasible_no_penalty"] = float(pb[feas_mask[pat]].sum())
                row["derived_state_p_optimal_no_penalty"] = float(pb[opt_mask[pat]].sum())
    return row


def run_random_control(sc, enum, model, shots, seed, alpha, penalty, opt_obj, run_index, instance):
    """Shot-matched uniform sampling over the same qubit register."""
    n = model.n_vars if model is not None else len(enum["variables"])
    n_dec = len(enum["variables"])
    rng = np.random.default_rng(seed)
    t0 = time.perf_counter()
    samples = rng.integers(0, 2 ** n, size=shots)
    by_code = {sum(b << k for k, b in enumerate(s["bits"])): s for s in enum["states"]}
    codes = samples & (2 ** n_dec - 1)
    feasible_frac = float(np.mean([by_code[int(c)]["feasible"] for c in codes]))
    chosen = [by_code[int(c)] for c in set(codes.tolist())]
    pool = [s for s in chosen if s["feasible"]] or chosen
    best = min(pool, key=lambda s: s["objective"])
    runtime = time.perf_counter() - t0
    alloc = bits_to_allocation(sc, enum["variables"], best["bits"])
    row = {
        "run_index": run_index, "instance": instance,
        "solver_name": RANDOM_CONTROL_NAME, "solver_type": "control_random_sampling",
        "qaoa_p": None, "seed": seed, "status": "ok", "error": None,
        "feasible": bool(best["feasible"]), "objective": best["objective"],
        "weighted_shortage": best["shortage"],
        "total_allocated_units": float(sum(best["bits"])),
        "runtime_seconds": runtime, "call_wall_seconds": runtime,
        "allocation": json.dumps(alloc, sort_keys=True),
        "audit_objective": best["objective"], "audit_feasible": best["feasible"],
        "objective_delta_vs_audit": 0.0, "audit_feasible_agrees": True,
        "gap_to_exact": best["objective"] - opt_obj,
        "approximation_ratio": best["objective"] / opt_obj if opt_obj > TOL else None,
        "hit_optimum": bool(best["feasible"] and abs(best["objective"] - opt_obj) <= 1e-6),
        "qaoa_shots": shots, "qaoa_num_qubits": n,
        "qaoa_feasible_samples_ratio": feasible_frac,
    }
    return row


def summarise(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[tuple, list[dict[str, Any]]] = {}
    for r in rows:
        key = (r["solver_name"], r["qaoa_p"])
        groups.setdefault(key, []).append(r)

    def stats(vals):
        vals = [v for v in vals if v is not None]
        if not vals:
            return None, None, None, None
        sd = statistics.stdev(vals) if len(vals) > 1 else 0.0
        return statistics.fmean(vals), sd, min(vals), max(vals)

    def order(item):
        (name, p), _ = item
        low = name.lower()
        rank = 0 if "greedy" in low else 1 if "exact" in low else 2 if "qaoa" in low else 3
        return (rank, p or 0, name)

    out = []
    for (name, p), g in sorted(groups.items(), key=order):
        ok = [r for r in g if r["status"] == "ok"]
        om, osd, omin, omax = stats([r["objective"] for r in ok])
        rm, rmed, rmin, rmax = stats([r["runtime_seconds"] for r in ok])
        fs = [r.get("qaoa_feasible_samples_ratio") for r in ok]
        out.append(
            {
                "solver_name": name, "qaoa_p": p, "runs": len(g), "ok_runs": len(ok),
                "failed_runs": len(g) - len(ok),
                "feasible_rate": statistics.fmean([r["feasible"] for r in ok]) if ok else None,
                "hit_optimum_rate": statistics.fmean([r["hit_optimum"] for r in ok]) if ok else None,
                "objective_mean": om, "objective_sd": osd, "objective_min": omin, "objective_max": omax,
                "approx_ratio_mean": stats([r["approximation_ratio"] for r in ok])[0],
                "runtime_mean_s": rm,
                "runtime_median_s": statistics.median([r["runtime_seconds"] for r in ok if r["runtime_seconds"] is not None]) if ok else None,
                "runtime_max_s": rmax,
                "feasible_sample_ratio_mean": stats(fs)[0],
                "modal_feasible_rate": (
                    statistics.fmean([r["derived_modal_feasible"] for r in ok])
                    if ok and all("derived_modal_feasible" in r for r in ok) else None
                ),
                "state_p_optimal_mean": stats([r.get("derived_state_p_optimal") for r in ok])[0],
                "state_p_feasible_mean": stats([r.get("derived_state_p_feasible") for r in ok])[0],
                "state_p_feasible_no_penalty_mean": stats([r.get("derived_state_p_feasible_no_penalty") for r in ok])[0],
                "state_p_optimal_no_penalty_mean": stats([r.get("derived_state_p_optimal_no_penalty") for r in ok])[0],
            }
        )
    return out


def _fmt(v: Any, nd: int = 3) -> str:
    if v is None:
        return "-"
    if isinstance(v, float):
        return f"{v:.{nd}f}"
    return str(v)


def print_summary(summary, audit, meta) -> None:
    print("=" * 78)
    print("WATERWEAVE benchmark -- " + SYNTHETIC_NOTICE)
    print(f"instance={meta['instance']}  alpha={meta['fairness_weight']}  "
          f"P={meta['penalty_weight']}  shots={meta['shots']}  seeds={meta['seeds']}")
    print("=" * 78)
    hdr = ("solver", "p", "ok/runs", "feas", "hit_opt", "obj mean+-sd", "min..max", "rt med s", "feasSamp")
    print("{:<44}{:>2} {:>7} {:>5} {:>7} {:>14} {:>11} {:>9} {:>8}".format(*hdr))
    for s in summary:
        print("{:<44}{:>2} {:>7} {:>5} {:>7} {:>14} {:>11} {:>9} {:>8}".format(
            s["solver_name"][:44], _fmt(s["qaoa_p"]),
            f"{s['ok_runs']}/{s['runs']}", _fmt(s["feasible_rate"], 2), _fmt(s["hit_optimum_rate"], 2),
            f"{_fmt(s['objective_mean'])}+-{_fmt(s['objective_sd'])}",
            f"{_fmt(s['objective_min'], 2)}..{_fmt(s['objective_max'], 2)}",
            _fmt(s["runtime_median_s"], 4), _fmt(s["feasible_sample_ratio_mean"], 2)))
    q = [s for s in summary if s["state_p_optimal_mean"] is not None]
    if q:
        print("-" * 78)
        print("Final-state (independent re-simulation) probability mass per QAOA depth:")
        if audit:
            fa = audit["facts"]
            print(f"  uniform reference (no optimisation): "
                  f"P(optimal pattern)={fa['uniform_p_optimal_pattern']:.4f}  "
                  f"P(feasible)={fa['uniform_p_feasible_pattern']:.4f}")
        for s in q:
            print(f"  p={s['qaoa_p']}: P(optimal decision pattern)={s['state_p_optimal_mean']:.4f}  "
                  f"P(feasible)={s['state_p_feasible_mean']:.4f}  modal-feasible-rate={_fmt(s['modal_feasible_rate'], 2)}")
            print(f"        same angles, penalties removed from H_C: "
                  f"P(optimal)={_fmt(s['state_p_optimal_no_penalty_mean'], 4)}  "
                  f"P(feasible)={_fmt(s['state_p_feasible_no_penalty_mean'], 4)}")
    if audit:
        print("-" * 78)
        for c in audit["checks"]:
            print(f"  [{c['status']:>7}] {c['name']}: {c['detail']}")
        f = audit["facts"]
        print(f"  optimum={_fmt(f.get('optimal_objective'))} (ties={f.get('n_optimal_ties')}), "
              f"feasible states {f.get('n_feasible_states')}/{f.get('n_states')}, "
              f"serve-nobody alpha threshold={_fmt(f.get('serve_nobody_alpha_threshold'))}")
    print("-" * 78)
    print("Limitations: " + " | ".join(LIMITATIONS[:2]))
    print("No quantum advantage is claimed.")
    print("=" * 78)


def write_outputs(out_dir: Path, stem: str, payload: dict[str, Any], rows) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path, json_path = out_dir / f"{stem}.csv", out_dir / f"{stem}.json"
    cols: list[str] = []
    for r in rows:
        for k in r:
            if k not in cols:
                cols.append(k)
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)

    def clean(o):
        if isinstance(o, float) and not math.isfinite(o):
            return None
        if isinstance(o, dict):
            return {str(k): clean(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)):
            return [clean(v) for v in o]
        if isinstance(o, np.generic):
            return clean(o.item())
        return o

    json_path.write_text(json.dumps(clean(payload), indent=2, sort_keys=False), encoding="utf-8")
    return csv_path, json_path


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def parse_args(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--instance", choices=("default", "small"), default="default",
                    help="'small' is a reduced synthetic instance for quick exact checks")
    ap.add_argument("--seeds", type=int, nargs="+", default=[0, 1, 2, 3, 4])
    ap.add_argument("--p-values", type=int, nargs="+", default=[1, 2, 3], help="QAOA depths")
    ap.add_argument("--shots", type=int, default=1024)
    ap.add_argument("--maxiter", type=int, default=25)
    ap.add_argument("--fairness-weight", type=float, default=2.0, help="alpha in the objective")
    ap.add_argument("--penalty-weight", type=float, default=None,
                    help="P; default = engine's compute_default_penalty_weight")
    ap.add_argument("--scenario-seed", type=int, default=42)
    ap.add_argument("--out-dir", type=Path, default=ROOT / "benchmark_results")
    ap.add_argument("--stem", default=None, help="output file stem (default benchmark_<instance>)")
    ap.add_argument("--skip-audit", action="store_true")
    ap.add_argument("--no-random-control", action="store_true")
    return ap.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    try:
        handles = _import_engine()
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    run_comparison = handles["run_comparison"]
    sc = build_instance(handles, args.instance, args.scenario_seed)
    sig = inspect.signature(run_comparison)
    accepts_kwargs = any(p.kind is p.VAR_KEYWORD for p in sig.parameters.values())
    wanted = {"p": None, "shots": None, "seed": None, "maxiter": None,
              "fairness_weight": None, "penalty_weight": None}
    forwardable = {k for k in wanted if k in sig.parameters or accepts_kwargs}
    f = handles.get("formulation")
    alpha = args.fairness_weight
    penalty = args.penalty_weight
    if penalty is None:
        if f is None or not hasattr(f, "compute_default_penalty_weight"):
            print("ERROR: --penalty-weight required (engine default not discoverable).", file=sys.stderr)
            return 2
        penalty = f.compute_default_penalty_weight(sc, fairness_weight=alpha)

    model = energy = None
    if f is not None:
        try:
            model = f.build_model(sc, fairness_weight=alpha, penalty_weight=penalty)
            if model.n_vars <= 20:
                energy = energy_vector(model)
        except Exception as exc:  # noqa: BLE001
            print(f"WARNING: engine model unavailable for derived analysis: {exc}", file=sys.stderr)

    enum = enumerate_instance(sc, alpha, penalty)
    base_energy = None
    if energy is not None and model is not None and model.n_decision == len(enum["variables"]):
        base = np.zeros(2 ** model.n_decision)
        for st in enum["states"]:
            base[sum(b << k for k, b in enumerate(st["bits"]))] = st["shortage"] + alpha * st["disparity"]
        base_energy = base[np.arange(2 ** model.n_vars) & (2 ** model.n_decision - 1)]
    feas = [s for s in enum["states"] if s["feasible"]]
    opt_obj = min((s["objective"] for s in feas), default=None)
    if opt_obj is None:
        print("ERROR: instance has no feasible allocation.", file=sys.stderr)
        return 2

    audit = None if args.skip_audit else run_audit(sc, handles, alpha, penalty, enum)

    rows: list[dict[str, Any]] = []
    qaoa_failures = 0
    idx = 0
    classical_ref: dict[str, float] = {}
    for p in args.p_values:
        for seed in args.seeds:
            kwargs = {"p": p, "shots": args.shots, "seed": seed, "maxiter": args.maxiter,
                      "fairness_weight": alpha, "penalty_weight": penalty}
            kwargs = {k: v for k, v in kwargs.items() if k in forwardable}
            t0 = time.perf_counter()
            try:
                results = run_comparison(sc, include_qaoa=True, **kwargs)
            except Exception as exc:  # noqa: BLE001
                print(f"ERROR: run_comparison raised {type(exc).__name__}: {exc}", file=sys.stderr)
                rows.append({"run_index": idx, "instance": sc.name, "solver_name": "run_comparison",
                             "qaoa_p": p, "seed": seed, "status": "error",
                             "error": f"{type(exc).__name__}: {exc}"})
                qaoa_failures += 1
                idx += 1
                continue
            wall = time.perf_counter() - t0
            if not any(is_qaoa(r) for r in results):
                qaoa_failures += 1
                rows.append({"run_index": idx, "instance": sc.name, "solver_name": "QAOA (missing)",
                             "qaoa_p": p, "seed": seed, "status": "error",
                             "error": "include_qaoa=True but no QAOA result was returned"})
            for res in results:
                row = make_row(res, run_index=idx, p=p, seed=seed, instance=sc.name, enum=enum,
                               opt_obj=opt_obj, alpha=alpha, penalty=penalty, call_wall=wall,
                               sc=sc, handles=handles, model=model, energy=energy,
                               base_energy=base_energy)
                if is_qaoa(res) and row["status"] != "ok":
                    qaoa_failures += 1
                if not is_qaoa(res) and res.objective_value is not None:
                    prev = classical_ref.setdefault(res.solver_name, res.objective_value)
                    if abs(prev - res.objective_value) > 1e-9:
                        row["status"] = "error"
                        row["error"] = "classical objective changed between runs"
                rows.append(row)
            if not args.no_random_control and model is not None:
                rows.append(run_random_control(sc, enum, model, args.shots, seed, alpha, penalty,
                                               opt_obj, idx, sc.name))
            idx += 1

    summary = summarise(rows)
    mismatches = [r for r in rows if r.get("objective_delta_vs_audit") not in (None, 0.0)
                  and r["objective_delta_vs_audit"] > 1e-6]
    meta = {
        "timestamp_utc": _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"),
        "command_line": [sys.executable, *sys.argv],
        "instance": sc.name,
        "synthetic_notice": SYNTHETIC_NOTICE,
        "scenario": {
            "name": sc.name, "slots": list(sc.slots), "seed": sc.seed,
            "supply_by_slot": sc.supply_by_slot,
            "neighborhoods": [
                {"id": n.id, "name": n.name, "demand_by_slot": n.demand_by_slot,
                 "priority_weight": n.priority_weight,
                 "storage_capacity_units": n.storage_capacity_units}
                for n in sc.neighborhoods
            ],
        },
        "fairness_weight": alpha, "penalty_weight": penalty, "shots": args.shots,
        "maxiter": args.maxiter, "seeds": args.seeds, "p_values": args.p_values,
        "run_comparison_parameters_forwarded": sorted(forwardable),
        "exact_optimum_objective_independent": opt_obj,
        "seed_note": LIMITATIONS[4],
        "provenance": provenance(handles),
    }
    payload = {"meta": meta, "audit": audit, "summary": summary, "runs": rows,
               "objective_mismatches_vs_audit": len(mismatches), "limitations": LIMITATIONS}
    stem = args.stem or f"benchmark_{args.instance}"
    csv_path, json_path = write_outputs(args.out_dir, stem, payload, rows)
    print_summary(summary, audit, meta)
    print(f"CSV : {csv_path}\nJSON: {json_path}")

    if qaoa_failures:
        print(f"FAILURE: {qaoa_failures} QAOA run(s) failed or missing; see 'error' column.", file=sys.stderr)
        return 3
    audit_fail = audit and any(c["status"] == "FAIL" for c in audit["checks"])
    if audit_fail or mismatches:
        print("FAILURE: audit check(s) failed or engine objectives disagree with the "
              "independent evaluation.", file=sys.stderr)
        return 4
    return 0


if __name__ == "__main__":
    sys.exit(main())
