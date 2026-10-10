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
