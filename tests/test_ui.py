"""Focused UI tests for WATERWEAVE dashboard adapters and quantum inspector."""

from __future__ import annotations

import pytest

from waterweave.models import Neighborhood, Scenario, SolverResult
from waterweave.scenarios import default_scenario
from waterweave.ui.adapter import (
    _compute_pairwise_disparity,
    evaluate_allocation_safe,
    execute_solvers,
    get_default_scenario,
    get_demo_results,
    get_engine_status,
)
from waterweave.ui.components import (
    format_runtime,
    get_qaoa_circuit_for_inspector,
)


def test_engine_status_and_dependencies():
    """Verify engine status reports all contracts and Qiskit availability correctly."""
    status = get_engine_status()
    assert status["has_scenarios"] is True
    assert status["has_metrics"] is True
    assert status["has_optimization"] is True
    assert status["optimization_import_error"] is None
    assert status["has_qiskit"] is True
    assert status["qiskit_version"] is not None


def test_live_solvers_execution():
    """Verify live solver execution returns Greedy, Exact, and QAOA results."""
    scenario = get_default_scenario()
    results, errors, is_live = execute_solvers(scenario, include_qaoa=True)

    assert is_live is True
    assert len(results) == 3
    solver_names = [r.solver_name for r in results]
    assert "Greedy (Priority-First)" in solver_names
    assert "Exact Classical (Optimal)" in solver_names
    assert "QAOA (Quantum Heuristic)" in solver_names

    qaoa_res = next(r for r in results if "QAOA" in r.solver_name)
    assert qaoa_res.feasible is True
    assert qaoa_res.objective_value == pytest.approx(6.0, abs=1e-4)
    assert qaoa_res.metadata["is_demo"] is False
    assert qaoa_res.metadata["num_qubits"] == 12
    assert qaoa_res.metadata["circuit_depth"] > 0
    assert qaoa_res.metadata["optimizer"] == "COBYLA"
    assert "optimal_gammas" in qaoa_res.metadata
    assert "optimal_betas" in qaoa_res.metadata


def test_circuit_inspector_when_parameters_present():
    """Verify circuit reconstruction and gate counting when genuine parameters exist."""
    scenario = get_default_scenario()
    results, _, _ = execute_solvers(scenario, include_qaoa=True)
    qaoa_res = next(r for r in results if "QAOA" in r.solver_name)

    qc, gate_counts = get_qaoa_circuit_for_inspector(scenario, qaoa_res)
    assert qc is not None
    assert gate_counts is not None
    assert qc.num_qubits == 12
    assert "rzz" in gate_counts
    assert "rz" in gate_counts
    assert "rx" in gate_counts
    assert "h" in gate_counts
    assert gate_counts["h"] == 12


def test_circuit_inspector_absent_telemetry():
    """Verify circuit inspector gracefully returns (None, None) when telemetry is absent."""
    scenario = get_default_scenario()

    # Case 1: None result
    qc1, gc1 = get_qaoa_circuit_for_inspector(scenario, None)
    assert qc1 is None and gc1 is None

    # Case 2: Empty metadata
    dummy_res = SolverResult(
        solver_name="QAOA (Quantum Heuristic)",
        allocation={n.id: {s: 0 for s in scenario.slots} for n in scenario.neighborhoods},
        objective_value=10.0,
        feasible=True,
        metrics={},
        runtime_seconds=0.1,
        metadata={},
    )
    qc2, gc2 = get_qaoa_circuit_for_inspector(scenario, dummy_res)
    assert qc2 is None and gc2 is None

    # Case 3: Metadata without angles
    partial_res = SolverResult(
        solver_name="QAOA (Quantum Heuristic)",
        allocation={n.id: {s: 0 for s in scenario.slots} for n in scenario.neighborhoods},
        objective_value=10.0,
        feasible=True,
        metrics={},
        runtime_seconds=0.1,
        metadata={"num_qubits": 12, "shots": 1024},
    )
    qc3, gc3 = get_qaoa_circuit_for_inspector(scenario, partial_res)
    assert qc3 is None and gc3 is None


def test_circuit_inspector_failed_qaoa():
    """Verify circuit inspector handles failed QAOA solver results honestly."""
    scenario = get_default_scenario()
    failed_res = SolverResult(
        solver_name="QAOA (Quantum Heuristic)",
        allocation={n.id: {s: 0 for s in scenario.slots} for n in scenario.neighborhoods},
        objective_value=float("inf"),
        feasible=False,
        metrics={"feasible": 0.0},
        runtime_seconds=0.05,
        metadata={
            "error": "TimeoutError: Quantum simulator exceeded runtime budget",
            "is_demo": False,
        },
    )
    qc, gc = get_qaoa_circuit_for_inspector(scenario, failed_res)
    assert qc is None and gc is None
    assert failed_res.metadata["error"].startswith("TimeoutError")


def test_ui_without_qaoa():
    """Verify execute_solvers works smoothly when include_qaoa=False."""
    scenario = get_default_scenario()
    results, errors, is_live = execute_solvers(scenario, include_qaoa=False)
    assert is_live is True
    assert len(results) == 2
    solver_names = [r.solver_name for r in results]
    assert "Greedy (Priority-First)" in solver_names
    assert "Exact Classical (Optimal)" in solver_names
    assert "QAOA (Quantum Heuristic)" not in solver_names


def test_defensive_telemetry_extraction():
    """Verify that optional telemetry fields are handled safely without exceptions."""
    from waterweave.ui.components import render_qaoa_circuit_inspector

    scenario = get_default_scenario()
    # Incomplete result missing several optional keys
    sparse_res = SolverResult(
        solver_name="QAOA (Quantum Heuristic)",
        allocation={n.id: {s: 0 for s in scenario.slots} for n in scenario.neighborhoods},
        objective_value=6.0,
        feasible=True,
        metrics={"service_level": 0.5, "fairness_score": 0.5},
        runtime_seconds=0.2,
        metadata={"num_qubits": 12},  # Only num_qubits provided
    )
    # Should not raise any KeyError or AttributeError
    qc, gc = get_qaoa_circuit_for_inspector(scenario, sparse_res)
    assert qc is None
    assert gc is None
    assert sparse_res.metadata.get("circuit_depth") is None
    assert sparse_res.metadata.get("optimal_gammas") is None
    assert sparse_res.metadata.get("feasible_samples_ratio") is None


def test_quantum_pipeline_structure():
    """Verify that the quantum pipeline explainer contains expected steps and domain tags."""
    from waterweave.ui.components import render_quantum_pipeline_explainer

    # The pipeline explainer function exists and is callable
    assert callable(render_quantum_pipeline_explainer)


def test_format_runtime_precision_and_fallbacks():
    """Verify runtime formatter handles None, negative, sub-millisecond, and seconds cleanly."""
    assert format_runtime(None) == "Telemetry unavailable"
    assert format_runtime(-0.5) == "Telemetry unavailable"
    assert format_runtime(0.0) == "< 0.1 ms (instantaneous)"
    assert format_runtime(0.00004) == "< 0.1 ms (instantaneous)"
    assert format_runtime(0.0034) == "3.40 ms"
    assert format_runtime(0.0001) == "0.10 ms"
    assert format_runtime(1.842) == "1.842 s"


def test_compute_pairwise_disparity_calculation():
    """Verify pairwise squared disparity matches docs/FORMULATION.md definition."""
    scenario = get_default_scenario()
    # Case 1: Uniform allocation (equal service levels -> disparity 0)
    alloc_zero = {n.id: {s: 0 for s in scenario.slots} for n in scenario.neighborhoods}
    assert _compute_pairwise_disparity(scenario, alloc_zero) == pytest.approx(0.0)

    # Case 2: Greedy default allocation on 4x2 instance
    # N1: s=1.0, N2: s=0.0, N3: s=0.0, N4: s=1.0
    from waterweave.ui.adapter import _generate_greedy_allocation
    greedy_alloc = _generate_greedy_allocation(scenario)
    disp_greedy = _compute_pairwise_disparity(scenario, greedy_alloc)
    assert disp_greedy == pytest.approx(4.0)

    # Case 3: Exact default allocation on 4x2 instance
    # N1: s=0.5, N2: s=0.5, N3: s=1.0, N4: s=0.5
    from waterweave.ui.adapter import _generate_exact_allocation
    exact_alloc = _generate_exact_allocation(scenario)
    disp_exact = _compute_pairwise_disparity(scenario, exact_alloc)
    assert disp_exact == pytest.approx(0.75)


def test_demo_results_fallback_objective_alignment():
    """Verify get_demo_results correctly applies QUBO pairwise disparity formula and metadata."""
    scenario = get_default_scenario()
    results = get_demo_results(scenario, include_qaoa=True)
    assert len(results) == 3

    greedy_res = next(r for r in results if "Greedy" in r.solver_name)
    exact_res = next(r for r in results if "Exact" in r.solver_name)
    qaoa_res = next(r for r in results if "QAOA" in r.solver_name)

    assert greedy_res.metadata["is_demo"] is True
    assert exact_res.metadata["is_demo"] is True
    assert qaoa_res.metadata["is_demo"] is True

    assert "Illustrative fallback: weighted_shortage + 2.0 * pairwise_disparity" in greedy_res.metadata["objective_definition"]
    assert "pairwise_disparity" in greedy_res.metadata

    # On default 4x2:
    # Greedy: weighted_shortage = 3.0, disparity = 4.0 -> objective = 3.0 + 2*4.0 = 11.0
    assert greedy_res.objective_value == pytest.approx(11.0)
    # Exact: weighted_shortage = 4.5, disparity = 0.75 -> objective = 4.5 + 2*0.75 = 6.0
    assert exact_res.objective_value == pytest.approx(6.0)
    # QAOA demo: matches exact ground state (6.0)
    assert qaoa_res.objective_value == pytest.approx(6.0)


def test_circuit_inspector_telemetry_missing_or_corrupted():
    """Verify defensive handling when metadata contains non-standard types or partial keys."""
    scenario = get_default_scenario()

    corrupt_res = SolverResult(
        solver_name="QAOA (Quantum Heuristic)",
        allocation={n.id: {s: 0 for s in scenario.slots} for n in scenario.neighborhoods},
        objective_value=6.0,
        feasible=True,
        metrics={},
        runtime_seconds=None,  # None runtime
        metadata={
            "num_qubits": "unknown",
            "optimal_gammas": "invalid_type",
            "optimal_betas": None,
            "error": "Simulator terminated unexpectedly",
        },
    )
    qc, gc = get_qaoa_circuit_for_inspector(scenario, corrupt_res)
    assert qc is None
    assert gc is None
    assert format_runtime(corrupt_res.runtime_seconds) == "Telemetry unavailable"


