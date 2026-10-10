"""Optimization entry point for WATERWEAVE.

Implements the contract specified in docs/INTERFACES.md:
waterweave.optimization.run_comparison(scenario: Scenario, include_qaoa: bool = True) -> list[SolverResult]
"""

from __future__ import annotations

from typing import Any

from waterweave.models import Scenario, SolverResult
from waterweave.solvers import solve_exact, solve_greedy, solve_qaoa


def run_comparison(
    scenario: Scenario,
    include_qaoa: bool = True,
    fairness_weight: float = 2.0,
    penalty_weight: float = 15.0,
    shots: int = 1024,
    p: int = 1,
    **kwargs: Any,
) -> list[SolverResult]:
    """Execute allocation solvers and return a list of SolverResult instances.

    Always includes:
    1. Greedy baseline (Priority-first classical heuristic)
    2. Exact baseline (Global optimal classical enumeration)
    3. QAOA (Parameterized quantum alternating operator ansatz, if include_qaoa=True)

    Args:
        scenario: The water allocation Scenario to solve.
        include_qaoa: Whether to execute the quantum QAOA solver.
        fairness_weight: Weight for the service disparity penalty (alpha).
        penalty_weight: Weight for supply/storage constraint violations (P).
        shots: Number of quantum circuit measurement shots.
        p: Number of QAOA variational layers.
        **kwargs: Additional parameters passed to solvers.

    Returns:
        List of SolverResult objects matching docs/INTERFACES.md.
    """
    results: list[SolverResult] = []

    # 1. Greedy baseline
    greedy_res = solve_greedy(
        scenario,
        fairness_weight=fairness_weight,
        penalty_weight=penalty_weight,
    )
    results.append(greedy_res)

    # 2. Exact classical baseline
    exact_res = solve_exact(
        scenario,
        fairness_weight=fairness_weight,
        penalty_weight=penalty_weight,
    )
    results.append(exact_res)

    # 3. QAOA quantum heuristic
    if include_qaoa:
        maxiter = kwargs.get("maxiter", 25)
        seed = kwargs.get("seed", scenario.seed)
        qaoa_res = solve_qaoa(
            scenario,
            p=p,
            shots=shots,
            maxiter=maxiter,
            fairness_weight=fairness_weight,
            penalty_weight=penalty_weight,
            seed=seed,
        )
        results.append(qaoa_res)

    return results


if __name__ == "__main__":
    from waterweave.scenarios import default_scenario

    sc = default_scenario()
    print("=" * 70)
    print("WATERWEAVE Optimization Comparison")
    print(f"Scenario: {sc.name} ({len(sc.neighborhoods)} neighborhoods, {len(sc.slots)} delivery slots)")
    print("=" * 70)

    comparison_results = run_comparison(sc, include_qaoa=True)
    for res in comparison_results:
        m = res.metrics
        print(f"\n--- {res.solver_name} ---")
        print(f"  Feasible:             {res.feasible}")
        print(f"  Objective Value:      {res.objective_value:.4f}")
        print(f"  Weighted Shortage:    {m.get('weighted_shortage', 0.0):.2f}")
        print(f"  Fairness Score:       {m.get('fairness_score', 0.0):.4f}")
        print(f"  Service Level:        {m.get('service_level', 0.0):.2%}")
        print(f"  Allocated / Demand:   {int(m.get('total_allocated_units', 0))}/{int(m.get('total_demand_units', 0))} units")
        print(f"  Runtime:              {res.runtime_seconds:.4f} s")
        print("  Allocation:")
        for nid, slots in res.allocation.items():
            print(f"    {nid}: {slots}")
        if "shots" in res.metadata:
            print(f"  QAOA Circuit:         depth={res.metadata['circuit_depth']}, qubits={res.metadata['num_qubits']}, shots={res.metadata['shots']}")
            print(f"  Feasible Samples:     {res.metadata['feasible_samples_ratio']:.2%}")
    print("\n" + "=" * 70)
