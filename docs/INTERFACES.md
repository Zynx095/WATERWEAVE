# Shared Python interfaces

All agents must follow these contracts. Coordinate before changing them.

## Shared models: src/waterweave/models.py

Neighborhood:
- id: str
- name: str
- demand_by_slot: dict[str, int]
- priority_weight: float = 1.0
- storage_capacity_units: int = 2

Scenario:
- name: str
- slots: tuple[str, ...]
- neighborhoods: tuple[Neighborhood, ...]
- supply_by_slot: dict[str, int]
- description: str = ""
- seed: int = 42

Allocation:
dict[neighborhood_id, dict[slot, integer_units]]

SolverResult:
- solver_name: str
- allocation: Allocation
- objective_value: float
- feasible: bool
- metrics: dict[str, float]
- runtime_seconds: float
- metadata: dict[str, Any]

## Scenario provider
waterweave.scenarios.default_scenario(seed: int = 42) -> Scenario

## Evaluation
waterweave.metrics.evaluate_allocation(
    scenario: Scenario,
    allocation: Allocation
) -> dict[str, float]

Expected metric keys include:
total_demand_units, total_allocated_units, unmet_demand_units,
weighted_shortage, service_level, fairness_score, disparity, feasible.

Define the metric directions clearly and use them consistently:
- `fairness_score` in [0, 1]: 1 - (max(s) - min(s)), higher is better.
- `disparity` >= 0: sum_{i<j} (s_i - s_j)^2, lower is better (exact quadratic term minimized by QUBO).

## Solver entry point
```python
waterweave.optimization.run_comparison(
    scenario: Scenario,
    include_qaoa: bool = True,
    fairness_weight: float = 2.0,
    penalty_weight: float | None = None,
    shots: int = 1024,
    p: int = 1,
    maxiter: int = 25,
    seed: int | None = None,
) -> list[SolverResult]
```

Parameters:
- `scenario`: Scenario instance to optimize.
- `include_qaoa`: bool, whether to run QAOA (default True).
- `fairness_weight`: float >= 0.0, alpha penalty for service level disparity (default 2.0).
- `penalty_weight`: float > 0.0 or None, constraint penalty coefficient P. If None, derived dynamically via `compute_default_penalty_weight(scenario, fairness_weight)`.
- `shots`: int >= 1, quantum circuit measurement sample count (default 1024).
- `p`: int >= 1, QAOA variational layers (default 1).
- `maxiter`: int >= 1, COBYLA optimizer evaluation budget (default 25).
- `seed`: int >= 0 or None, random seed for sampling reproducibility.

Return list of `SolverResult`:
1. Greedy baseline: `solver_name="Greedy (Priority-First)"`
2. Exact classical baseline: `solver_name="Exact Classical (Optimal)"`
3. QAOA quantum heuristic: `solver_name="QAOA (Quantum Heuristic)"` (if `include_qaoa=True`)

Expected QAOA `metadata` telemetry keys:
- `solver_type`: `"quantum_approximate"`
- `layers_p`: `int` (QAOA circuit layer depth)
- `shots`: `int` (measurement shot count)
- `num_qubits`: `int` (total problem qubits including slack)
- `circuit_depth`: `int` (executed circuit depth)
- `optimizer`: `"COBYLA"`
- `optimizer_iterations`: `int` (optimizer evaluations)
- `optimizer_converged`: `bool` (whether optimizer converged within maxiter)
- `optimizer_status`: `"converged"` or `"maxiter_reached"`
- `grid_evaluations`: `int` (warm-start grid evaluations)
- `total_evaluations`: `int` (grid + optimizer evaluations)
- `optimal_gammas`: `list[float]`
- `optimal_betas`: `list[float]`
- `sampled_unique_bitstrings`: `int`
- `feasible_samples_ratio`: `float` (measured fraction of feasible bitstrings)
- `modal_bitstring`: `str` (most frequently sampled bitstring)
- `modal_bitstring_feasible`: `bool` (feasibility of modal bitstring)
- `modal_bitstring_objective`: `float` (evaluated objective of modal bitstring)
- `modal_bitstring_count`: `int` (shot count of modal bitstring)
- `selection_rule`: `"best_feasible_slack_consistent"`
- `best_bitstring`: `str` (selected bitstring for reported allocation)
- `qubo_energy`: `float` (QUBO energy of selected bitstring)
- `slack_consistent`: `bool` (whether QUBO energy matches evaluated objective)
- `fairness_weight`: `float`
- `penalty_weight`: `float`
- `seed`: `int`
- `is_demo`: `False`
- `quantum_advantage_claimed`: `False`


## UI
The root app.py imports the shared scenario provider and solver entry
point. UI code must not duplicate optimization or metric calculations.
