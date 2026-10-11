"""Tests for waterweave.solvers: Greedy, Exact, and QAOA."""

from dataclasses import replace
import pytest

from waterweave.metrics import evaluate_allocation
from waterweave.models import Neighborhood, Scenario
from waterweave.scenarios import default_scenario
from waterweave.solvers import solve_exact, solve_greedy, solve_qaoa

S = default_scenario()


def test_greedy_solver():
    """Verify objective-aware greedy allocation behavior."""
    res = solve_greedy(S)
    assert res.solver_name == "Greedy (Priority-First)"
    assert res.feasible is True
    assert res.metadata["solver_type"] == "classical_heuristic"
    assert res.metadata["is_demo"] is False

    # Objective-aware greedy balances shortage and disparity, achieving obj 7.0
    assert res.metrics["weighted_shortage"] == pytest.approx(5.5)
    assert res.metrics["fairness_score"] == pytest.approx(0.5)
    assert res.metrics["total_allocated_units"] == 3.0
    assert res.objective_value == pytest.approx(7.0)


def test_greedy_does_not_exceed_empty_allocation_objective():
    """Verify greedy heuristic returns an objective at least as good as allocating nothing.

    Regression test: on default scenario, pure priority-first allocation
    allocates 4 units but scores objective 11.0 due to high disparity, whereas
    the trivial zero-allocation baseline scores 10.0.
    """
    from waterweave.formulation import evaluate_objective
    res = solve_greedy(S)
    empty_alloc = {n.id: {s: 0 for s in S.slots} for n in S.neighborhoods}
    empty_obj = evaluate_objective(S, empty_alloc)
    assert res.objective_value <= empty_obj



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
    """Verify exact solver discovers an optimal allocation that beats greedy on combined objective."""
    greedy_res = solve_greedy(S)
    exact_res = solve_exact(S)
    assert exact_res.objective_value < greedy_res.objective_value
    assert exact_res.metrics["fairness_score"] >= greedy_res.metrics["fairness_score"]
    assert exact_res.metrics["total_allocated_units"] > greedy_res.metrics["total_allocated_units"]


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
    assert meta["slack_consistent"] is True
    assert meta["qubo_energy"] == pytest.approx(res.objective_value)


def test_qaoa_infeasible_modal_sample_selection():
    """Verify that QAOA post-selects a feasible candidate even when modal sample is infeasible.

    Empirically, seed=0 yields an infeasible modal bitstring on the default scenario.
    The solver's selection rule selects a feasible state with consistent slack variables.
    """
    res = solve_qaoa(S, p=1, shots=1024, maxiter=25, seed=0)
    meta = res.metadata
    assert meta["modal_bitstring_feasible"] is False
    assert res.feasible is True
    assert res.objective_value == pytest.approx(6.0)
    assert meta["modal_bitstring"] != meta["best_bitstring"]
    assert meta["selection_rule"] == "best_feasible_slack_consistent"
    assert meta["slack_consistent"] is True


def test_qaoa_seed_reproducibility_and_suboptimal_run():
    """Verify QAOA seed reproducibility and verify honest reporting of suboptimal runs (e.g. seed=4)."""
    res_a = solve_qaoa(S, p=1, shots=512, maxiter=25, seed=4)
    res_b = solve_qaoa(S, p=1, shots=512, maxiter=25, seed=4)
    assert res_a.allocation == res_b.allocation
    assert res_a.metadata["best_bitstring"] == res_b.metadata["best_bitstring"]
    assert res_a.objective_value == res_b.objective_value
    # Seed 4 lands on objective 7.0 (honest non-fabricated run)
    assert res_a.objective_value == pytest.approx(7.0)



def test_greedy_binary_decision_cap():
    """Verify greedy assigns at most 1 unit per slot even when demand is > 1."""
    sc_multi = Scenario(
        name="multi-demand",
        slots=("morning",),
        neighborhoods=(
            Neighborhood("N1", "N1", {"morning": 3}, priority_weight=1.0, storage_capacity_units=3),
        ),
        supply_by_slot={"morning": 5},
    )
    rg = solve_greedy(sc_multi)
    assert rg.feasible is True
    assert rg.allocation["N1"]["morning"] == 1


def test_qaoa_failure_handling():
    """Verify QAOA handles invalid settings or runtime failures cleanly."""
    res = solve_qaoa(S, shots=0)
    assert res.feasible is False
    assert res.objective_value == float("inf")
    assert res.metrics["feasible"] == 0.0
    assert "error" in res.metadata


def test_solvers_asymmetric_3slots():
    """Verify solvers handle asymmetric 3-slot custom scenarios."""
    sc_3slots = Scenario(
        name="test-3slots",
        slots=("morning", "afternoon", "evening"),
        neighborhoods=(
            Neighborhood("N1", "N1", {"morning": 1, "afternoon": 0, "evening": 1}, 1.0, 2),
            Neighborhood("N2", "N2", {"morning": 0, "afternoon": 1, "evening": 1}, 1.0, 2),
        ),
        supply_by_slot={"morning": 1, "afternoon": 1, "evening": 1},
    )
    rg = solve_greedy(sc_3slots)
    assert rg.feasible is True
    re = solve_exact(sc_3slots)
    assert re.feasible is True
    rq = solve_qaoa(sc_3slots, p=1, shots=512)
    assert rq.feasible is True


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


def test_empty_neighborhoods_scenario():
    """Verify solvers handle scenario with no neighborhoods gracefully."""
    empty_s = Scenario(
        name="empty-s",
        slots=("morning",),
        neighborhoods=(),
        supply_by_slot={"morning": 10},
    )
    rg = solve_greedy(empty_s)
    assert rg.feasible is True
    assert rg.objective_value == 0.0

    re = solve_exact(empty_s)
    assert re.feasible is True
    assert re.objective_value == 0.0

    rq = solve_qaoa(empty_s, p=1, shots=100)
    assert rq.feasible is True
    assert rq.objective_value == 0.0


def test_qaoa_p2_execution():
    """Verify QAOA with p=2 layers executes with correct circuit depth."""
    res = solve_qaoa(S, p=2, shots=512, maxiter=10, seed=42)
    assert res.feasible is True
    assert res.metadata["layers_p"] == 2
    assert res.metadata["circuit_depth"] == 29
    assert len(res.metadata["optimal_gammas"]) == 2
    assert len(res.metadata["optimal_betas"]) == 2



def test_qaoa_notes_state_simulation_and_make_no_performance_claim():
    """Regression: the note once said the simulation 'compares favorably in sampling diversity'."""
    from waterweave.scenarios import default_scenario
    from waterweave.solvers import solve_qaoa

    meta = solve_qaoa(default_scenario(), shots=64, maxiter=3).metadata
    notes = meta["notes"].lower()
    assert "simulator" in notes and "no quantum advantage" in notes
    assert "favorabl" not in notes
    assert meta["quantum_advantage_claimed"] is False


def test_qaoa_reports_the_iteration_limit_it_really_used():
    """Regression: maxiter=1 was silently raised by SciPy to 4 and reported as requested."""
    import warnings

    from waterweave.scenarios import default_scenario
    from waterweave.solvers import solve_qaoa

    with warnings.catch_warnings():
        warnings.simplefilter("error")  # SciPy must not need to warn
        meta = solve_qaoa(default_scenario(), p=1, shots=32, maxiter=1).metadata
    assert meta["optimizer_maxiter_requested"] == 1
    assert meta["optimizer_maxiter_used"] == 4
    assert meta["optimizer_iterations"] <= meta["optimizer_maxiter_used"]
