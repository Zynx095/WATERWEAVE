from dataclasses import dataclass, field
from typing import Any, TypeAlias

Allocation: TypeAlias = dict[str, dict[str, int]]

@dataclass(frozen=True)
class Neighborhood:
    id: str
    name: str
    demand_by_slot: dict[str, int]
    priority_weight: float = 1.0
    storage_capacity_units: int = 2

@dataclass(frozen=True)
class Scenario:
    name: str
    slots: tuple[str, ...]
    neighborhoods: tuple[Neighborhood, ...]
    supply_by_slot: dict[str, int]
    description: str = ""
    seed: int = 42

@dataclass
class SolverResult:
    solver_name: str
    allocation: dict[str, dict[str, int]]
    objective_value: float
    feasible: bool
    metrics: dict[str, float]
    runtime_seconds: float
    metadata: dict[str, Any] = field(default_factory=dict)
