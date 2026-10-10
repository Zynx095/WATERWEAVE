"""Shared allocation evaluation.

Definitions (units are integer allocation units):
- A cell is the allocation of neighborhood i in slot t.
- served_i = sum_t min(alloc[i][t], demand[i][t])   (over-allocation earns nothing)
- unmet_i  = total_demand_i - served_i
- service_level   = sum_i served_i / total_demand   (1.0 if total demand is 0)
- weighted_shortage = sum_i priority_weight_i * unmet_i   (lower is better)
- fairness_score  = 1 - (max_i s_i - min_i s_i), s_i = served_i / total_demand_i,
  over neighborhoods with total_demand_i > 0. Range [0, 1]; HIGHER IS BETTER;
  1.0 means all service levels are equal. Measures range-based equality only.
- disparity       = sum_{i<j} (s_i - s_j)^2, pairwise squared service level differences.
  LOWER IS BETTER; this exact quadratic polynomial is minimized by the QUBO/Ising model.
- feasible = 1.0 iff there are no invalid entries and no demand, supply or
  storage violations (storage: sum_t alloc[i][t] <= storage_capacity_units).
"""

from waterweave.models import Scenario

Allocation = dict[str, dict[str, int]]


def _clean_cell(value) -> int | None:
    """Return a non-negative int, or None if the entry is invalid."""
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return None
    return value


def evaluate_allocation(scenario: Scenario, allocation: Allocation) -> dict[str, float]:
    ids = {n.id for n in scenario.neighborhoods}
    slots = set(scenario.slots)

    invalid = 0
    cells: dict[str, dict[str, int]] = {n.id: {} for n in scenario.neighborhoods}
    for nid, per_slot in allocation.items():
        if nid not in ids or not isinstance(per_slot, dict):
            invalid += 1
            continue
        for slot, value in per_slot.items():
            clean = _clean_cell(value)
            if slot not in slots or clean is None:
                invalid += 1
                continue
            cells[nid][slot] = clean

    total_demand = total_alloc = served_total = 0
    demand_viol = storage_viol = 0
    weighted_shortage = 0.0
    service_levels: list[float] = []

    for n in scenario.neighborhoods:
        nd = sum(n.demand_by_slot.get(t, 0) for t in scenario.slots)
        served = 0
        n_alloc = 0
        for t in scenario.slots:
            a = cells[n.id].get(t, 0)
            d = n.demand_by_slot.get(t, 0)
            n_alloc += a
            served += min(a, d)
            demand_viol += max(0, a - d)
        storage_viol += max(0, n_alloc - n.storage_capacity_units)
        total_demand += nd
        total_alloc += n_alloc
        served_total += served
        weighted_shortage += n.priority_weight * (nd - served)
        if nd > 0:
            service_levels.append(served / nd)

    supply_viol = 0
    for t in scenario.slots:
        used = sum(cells[n.id].get(t, 0) for n in scenario.neighborhoods)
        supply_viol += max(0, used - scenario.supply_by_slot.get(t, 0))

    service_level = served_total / total_demand if total_demand else 1.0
    fairness = 1.0 - (max(service_levels) - min(service_levels)) if service_levels else 1.0
    disparity = 0.0
    if len(service_levels) > 1:
        for i in range(len(service_levels)):
            for j in range(i + 1, len(service_levels)):
                disparity += (service_levels[i] - service_levels[j]) ** 2
    feasible = invalid == 0 and demand_viol == 0 and supply_viol == 0 and storage_viol == 0

    return {
        "total_demand_units": float(total_demand),
        "total_allocated_units": float(total_alloc),
        "unmet_demand_units": float(total_demand - served_total),
        "weighted_shortage": float(weighted_shortage),
        "service_level": float(service_level),
        "fairness_score": float(fairness),
        "disparity": float(disparity),
        "feasible": 1.0 if feasible else 0.0,
        "invalid_entries": float(invalid),
        "demand_violation_units": float(demand_viol),
        "supply_violation_units": float(supply_viol),
        "storage_violation_units": float(storage_viol),
    }
