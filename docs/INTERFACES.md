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
waterweave.optimization.run_comparison(
    scenario: Scenario,
    include_qaoa: bool = True
) -> list[SolverResult]

Return the greedy and exact results, plus QAOA when requested and
available. If QAOA fails, expose the error clearly rather than
silently labeling a classical result as quantum.

## UI
The root app.py imports the shared scenario provider and solver entry
point. UI code must not duplicate optimization or metric calculations.
