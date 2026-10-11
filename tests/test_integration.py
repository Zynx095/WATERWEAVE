"""End-to-end integration test suite for WATERWEAVE.

Validates complete interaction across:
- Core models and contracts (models.py)
- Mathematical formulation and QUBO/Ising mapping (formulation.py)
- Shared metrics evaluation and disparity separation (metrics.py)
- Classical baselines and QAOA quantum heuristic (solvers.py)
- Solver orchestrator entry point (optimization.py)
- Streamlit application adapter, circuit inspector, and demo fallback (ui/adapter.py, ui/components.py)
"""

import math
import pytest

from waterweave.models import Allocation, Neighborhood, Scenario, SolverResult
from waterweave.scenarios import default_scenario
from waterweave.metrics import evaluate_allocation
from waterweave.formulation import build_model, evaluate_objective
from waterweave.optimization import run_comparison
from waterweave.ui.adapter import (
    execute_solvers,
    get_demo_results,
    get_engine_status,
)
from waterweave.ui.components import get_qaoa_circuit_for_inspector


def test_models_allocation_contract():
    """Verify models.py exports Scenario, Neighborhood, SolverResult, and Allocation alias."""
    sc = default_scenario()
    assert isinstance(sc, Scenario)
    assert len(sc.neighborhoods) == 4
    assert len(sc.slots) == 2

    # Check Allocation type annotation compatibility
    alloc: Allocation = {n.id: {s: 0 for s in sc.slots} for n in sc.neighborhoods}
    m = evaluate_allocation(sc, alloc)
    assert m["feasible"] == 1.0


def test_shared_metrics_contract_keys_and_values():
    """Verify evaluate_allocation returns all required metric keys and valid numeric ranges."""
    sc = default_scenario()
    alloc: Allocation = {
        "N1": {"morning": 0, "evening": 1},
        "N2": {"morning": 0, "evening": 1},
        "N3": {"morning": 1, "evening": 0},
        "N4": {"morning": 1, "evening": 0},
    }
    m = evaluate_allocation(sc, alloc)

    required_keys = {
        "total_demand_units",
        "total_allocated_units",
        "unmet_demand_units",
        "weighted_shortage",
        "service_level",
        "fairness_score",
        "disparity",
        "feasible",
        "invalid_entries",
        "demand_violation_units",
        "supply_violation_units",
        "storage_violation_units",
    }
    assert required_keys.issubset(m.keys())
    assert 0.0 <= m["service_level"] <= 1.0
    assert 0.0 <= m["fairness_score"] <= 1.0
    assert m["disparity"] >= 0.0
    assert m["feasible"] in (0.0, 1.0)


def test_fairness_score_and_disparity_are_distinct():
    """Verify fairness_score and disparity are distinct mathematical quantities."""
    sc = default_scenario()
    # Allocation 1: unequal service
    alloc1: Allocation = {
        "N1": {"morning": 1, "evening": 1},
        "N2": {"morning": 0, "evening": 0},
        "N3": {"morning": 0, "evening": 0},
        "N4": {"morning": 1, "evening": 1},
    }
    m1 = evaluate_allocation(sc, alloc1)

    # Allocation 2: balanced service
    alloc2: Allocation = {
        "N1": {"morning": 0, "evening": 1},
        "N2": {"morning": 0, "evening": 1},
        "N3": {"morning": 1, "evening": 0},
        "N4": {"morning": 1, "evening": 0},
    }
    m2 = evaluate_allocation(sc, alloc2)

    # Fairness score: higher is better; Disparity: lower is better
    assert m2["fairness_score"] >= m1["fairness_score"]
    assert m2["disparity"] < m1["disparity"]


def test_run_comparison_full_contract():
    """Verify run_comparison returns Greedy, Exact, and QAOA with compliant SolverResult structures."""
    sc = default_scenario(seed=42)
    results = run_comparison(sc, include_qaoa=True, shots=512, p=1, maxiter=10)

    assert len(results) == 3
    greedy_res, exact_res, qaoa_res = results

    # Solver names
    assert greedy_res.solver_name == "Greedy (Priority-First)"
    assert exact_res.solver_name == "Exact Classical (Optimal)"
    assert qaoa_res.solver_name == "QAOA (Quantum Heuristic)"

    # Live execution metadata
    assert greedy_res.metadata["is_demo"] is False
    assert exact_res.metadata["is_demo"] is False
    assert qaoa_res.metadata["is_demo"] is False

    # Exact optimal objective is 6.0 on default synthetic 4x2
    assert exact_res.feasible is True
    assert exact_res.objective_value == pytest.approx(6.0)

    # Greedy achieves feasible solution
    assert greedy_res.feasible is True
    assert greedy_res.objective_value >= exact_res.objective_value

    # QAOA finds feasible near-optimal candidate
    assert qaoa_res.feasible is True
    assert qaoa_res.objective_value >= exact_res.objective_value - 1e-6

    # QAOA rich telemetry keys matching docs/INTERFACES.md
    meta = qaoa_res.metadata
    assert meta["solver_type"] == "quantum_approximate"
    assert meta["layers_p"] == 1
    assert meta["shots"] == 512
    assert meta["num_qubits"] == 12
    assert meta["circuit_depth"] > 0
    assert meta["optimizer"] == "COBYLA"
    assert "optimizer_iterations" in meta
    assert "optimal_gammas" in meta and len(meta["optimal_gammas"]) == 1
    assert "optimal_betas" in meta and len(meta["optimal_betas"]) == 1
    assert "modal_bitstring" in meta
    assert "best_bitstring" in meta
    assert "qubo_energy" in meta
    assert "slack_consistent" in meta
    assert meta["quantum_advantage_claimed"] is False


def test_run_comparison_qaoa_disabled():
    """Verify include_qaoa=False returns exactly Greedy and Exact baselines."""
    sc = default_scenario()
    results = run_comparison(sc, include_qaoa=False)
    assert len(results) == 2
    names = [r.solver_name for r in results]
    assert "Greedy (Priority-First)" in names
    assert "Exact Classical (Optimal)" in names
    assert not any("QAOA" in n for n in names)


def test_execute_solvers_live_adapter_integration():
    """Verify execute_solvers runs live engine and integrates with circuit inspector."""
    sc = default_scenario()
    status = get_engine_status()
    assert status["has_optimization"] is True
    assert status["has_scenarios"] is True
    assert status["has_metrics"] is True
    assert status["has_qiskit"] is True

    results, errors, is_live = execute_solvers(sc, include_qaoa=True, timeout_seconds=20.0)
    assert is_live is True
    assert not errors

    qaoa_res = next(r for r in results if "QAOA" in r.solver_name)
    assert qaoa_res.metadata.get("is_demo") is False

    # Circuit inspector reconstruction
    qc, gate_counts = get_qaoa_circuit_for_inspector(sc, qaoa_res)
    assert qc is not None
    assert gate_counts is not None
    assert qc.num_qubits == 12
    assert gate_counts["h"] == 12
    assert gate_counts["rzz"] > 0
    assert gate_counts["rz"] > 0
    assert gate_counts["rx"] > 0


def test_demo_fallback_contract():
    """Verify get_demo_results returns cleanly labeled demo results."""
    sc = default_scenario()
    results = get_demo_results(sc, include_qaoa=True)
    assert len(results) == 3
    for r in results:
        assert r.metadata.get("is_demo") is True
        assert "pairwise_disparity" in r.metadata
        assert "disparity" in r.metrics
