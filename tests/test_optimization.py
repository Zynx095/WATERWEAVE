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
