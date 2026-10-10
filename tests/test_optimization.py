"""Tests for waterweave.optimization: run_comparison contract and dashboard integration."""

import pytest

from waterweave.models import SolverResult
from waterweave.optimization import run_comparison
from waterweave.scenarios import default_scenario

S = default_scenario()


def test_run_comparison_with_qaoa():
    """Verify run_comparison returns 3 valid SolverResults when include_qaoa=True."""
    results = run_comparison(S, include_qaoa=True)
    assert len(results) == 3

    names = [r.solver_name for r in results]
    assert names[0] == "Greedy (Priority-First)"
    assert names[1] == "Exact Classical (Optimal)"
    assert names[2] == "QAOA (Quantum Heuristic)"

    for r in results:
        assert isinstance(r, SolverResult)
        assert isinstance(r.allocation, dict)
        assert isinstance(r.objective_value, float)
        assert isinstance(r.feasible, bool)
        assert isinstance(r.metrics, dict)
        assert isinstance(r.runtime_seconds, float)
        assert isinstance(r.metadata, dict)
        assert r.metadata.get("is_demo") is False

        # Metrics contract
        expected_metrics = {
            "total_demand_units",
            "total_allocated_units",
            "unmet_demand_units",
            "weighted_shortage",
            "service_level",
            "fairness_score",
            "feasible",
        }
        assert expected_metrics <= set(r.metrics.keys())


def test_run_comparison_without_qaoa():
    """Verify run_comparison returns 2 valid SolverResults when include_qaoa=False."""
    results = run_comparison(S, include_qaoa=False)
    assert len(results) == 2
    assert results[0].solver_name == "Greedy (Priority-First)"
    assert results[1].solver_name == "Exact Classical (Optimal)"


def test_run_comparison_custom_scenario():
    """Verify run_comparison succeeds on custom scenario with dynamic penalty."""
    from waterweave.models import Neighborhood, Scenario
    sc_custom = Scenario(
        name="custom-test",
        slots=("slot1", "slot2"),
        neighborhoods=(
            Neighborhood("A", "Area A", {"slot1": 1, "slot2": 0}, priority_weight=5.0, storage_capacity_units=1),
            Neighborhood("B", "Area B", {"slot1": 0, "slot2": 1}, priority_weight=2.0, storage_capacity_units=1),
        ),
        supply_by_slot={"slot1": 1, "slot2": 1},
    )
    results = run_comparison(sc_custom, include_qaoa=True, shots=256)
    assert len(results) == 3
    for r in results:
        assert r.feasible is True
        assert r.objective_value == pytest.approx(0.0)
        assert r.metrics["total_allocated_units"] == 2.0


def test_run_comparison_invalid_settings_rejection():
    """Verify run_comparison raises ValueError on invalid parameter types or values."""
    with pytest.raises(ValueError, match="p must be a positive integer"):
        run_comparison(S, p=0)

    with pytest.raises(ValueError, match="shots must be a positive integer"):
        run_comparison(S, shots=-1)

    with pytest.raises(ValueError, match="maxiter must be a positive integer"):
        run_comparison(S, maxiter=0)

    with pytest.raises(ValueError, match="fairness_weight must be non-negative"):
        run_comparison(S, fairness_weight=-1.0)

    with pytest.raises(ValueError, match="Unsupported keyword argument"):
        run_comparison(S, unknown_setting=123)


def test_qaoa_rich_telemetry():
    """Verify QAOA result contains consistent, transparent execution metadata."""
    results = run_comparison(S, include_qaoa=True, p=1, shots=256, maxiter=25, seed=42)
    qaoa = results[2]
    meta = qaoa.metadata

    expected_keys = {
        "solver_type", "layers_p", "shots", "num_qubits", "circuit_depth",
        "optimizer", "optimizer_iterations", "optimizer_converged", "optimizer_status",
        "grid_evaluations", "total_evaluations", "optimal_gammas", "optimal_betas",
        "sampled_unique_bitstrings", "feasible_samples_ratio", "modal_bitstring",
        "modal_bitstring_feasible", "selection_rule", "best_bitstring",
        "qubo_energy", "slack_consistent", "quantum_advantage_claimed", "seed",
    }
    assert expected_keys <= set(meta.keys())
    assert meta["solver_type"] == "quantum_approximate"
    assert meta["layers_p"] == 1
    assert meta["shots"] == 256
    assert meta["seed"] == 42
    assert meta["optimizer"] == "COBYLA"
    assert isinstance(meta["optimizer_converged"], bool)
    assert meta["optimizer_status"] in ("converged", "maxiter_reached")
    assert meta["grid_evaluations"] == 36
    assert meta["total_evaluations"] == 36 + meta["optimizer_iterations"]
    assert meta["selection_rule"] == "best_feasible_slack_consistent"
    assert isinstance(meta["modal_bitstring_feasible"], bool)

