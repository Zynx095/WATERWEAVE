"""Tests for waterweave.solvers: Greedy, Exact, and QAOA."""

from dataclasses import replace
import pytest

from waterweave.metrics import evaluate_allocation
from waterweave.models import Neighborhood, Scenario
from waterweave.scenarios import default_scenario
from waterweave.solvers import solve_exact, solve_greedy, solve_qaoa

S = default_scenario()


def test_greedy_solver():
    """Verify greedy priority-first allocation behavior."""
    res = solve_greedy(S)
    assert res.solver_name == "Greedy (Priority-First)"
    assert res.feasible is True
    assert res.metadata["solver_type"] == "classical_heuristic"
    assert res.metadata["is_demo"] is False

    # Greedy prioritizes N4 (w=2.0) and N1 (w=1.5), exhausting supply
    alloc = res.allocation
    assert alloc["N4"]["morning"] == 1
    assert alloc["N4"]["evening"] == 1
    assert alloc["N1"]["morning"] == 1
    assert alloc["N1"]["evening"] == 1
    assert alloc["N2"]["morning"] == 0
    assert alloc["N2"]["evening"] == 0
    assert alloc["N3"]["morning"] == 0

    # Shortage is low (3.0), but fairness is 0.0 due to extreme disparity
    assert res.metrics["weighted_shortage"] == pytest.approx(3.0)
    assert res.metrics["fairness_score"] == pytest.approx(0.0)
    # Total objective = 3.0 + 2.0 * (4.0 disparity) = 11.0
    assert res.objective_value == pytest.approx(11.0)


def test_exact_solver_optimal():
    """Verify exact solver achieves global optimum balancing shortage and fairness."""
    res = solve_exact(S)
    assert res.solver_name == "Exact Classical (Optimal)"
    assert res.feasible is True
    assert res.metadata["solver_type"] == "classical_exact"
    assert res.metadata["total_candidates_evaluated"] == 128
    assert res.metadata["is_demo"] is False

    # Exact global minimum achieves objective = 6.0
    assert res.objective_value == pytest.approx(6.0)
    # Every neighborhood receives 1 unit
    assert res.metrics["fairness_score"] == pytest.approx(0.5)
    assert res.metrics["total_allocated_units"] == 4.0
    assert res.metrics["weighted_shortage"] == pytest.approx(4.5)


def test_exact_strictly_beats_greedy_on_combined_objective():
    """Verify exact solver discovers an equitable allocation that beats greedy on combined objective."""
    greedy_res = solve_greedy(S)
    exact_res = solve_exact(S)
    assert exact_res.objective_value < greedy_res.objective_value
    assert exact_res.metrics["fairness_score"] > greedy_res.metrics["fairness_score"]


def test_qaoa_solver_execution():
    """Verify QAOA executes a genuine quantum circuit and returns valid results."""
    res = solve_qaoa(S, p=1, shots=1024, maxiter=25, seed=42)
    assert res.solver_name == "QAOA (Quantum Heuristic)"
    assert res.feasible is True
    assert res.objective_value == pytest.approx(6.0)
    assert res.runtime_seconds > 0.0

    meta = res.metadata
    assert meta["solver_type"] == "quantum_approximate"
    assert meta["layers_p"] == 1
    assert meta["shots"] == 1024
    assert meta["num_qubits"] == 12
    assert meta["circuit_depth"] > 0
    assert meta["is_demo"] is False
    assert meta["quantum_advantage_claimed"] is False
    assert meta["feasible_samples_ratio"] > 0.3
    assert len(meta["optimal_gammas"]) == 1
    assert len(meta["optimal_betas"]) == 1


def test_zero_demand_scenario():
    """Verify solvers handle zero-demand scenario without error."""
    zero_s = replace(
        S,
        neighborhoods=(
            Neighborhood("N1", "N1", {"morning": 0, "evening": 0}),
        ),
        supply_by_slot={"morning": 0, "evening": 0},
    )
    rg = solve_greedy(zero_s)
    assert rg.feasible is True
    assert rg.objective_value == 0.0

    re = solve_exact(zero_s)
    assert re.feasible is True
    assert re.objective_value == 0.0

    rq = solve_qaoa(zero_s, p=1, shots=100)
    assert rq.feasible is True
    assert rq.objective_value == 0.0


def test_zero_supply_scenario():
    """Verify solvers correctly allocate 0 units when supply is completely exhausted."""
    zero_sup = replace(S, supply_by_slot={"morning": 0, "evening": 0})
    rg = solve_greedy(zero_sup)
    assert rg.feasible is True
    assert rg.metrics["total_allocated_units"] == 0

    re = solve_exact(zero_sup)
    assert re.feasible is True
    assert re.metrics["total_allocated_units"] == 0
