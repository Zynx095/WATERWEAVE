"""Mathematical formulation of the WATERWEAVE water-allocation optimization problem.

Translates a Scenario into an explicit binary quadratic model (QUBO) and
corresponding Ising problem Hamiltonian for quantum algorithms (QAOA),
with explicit slack-variable encodings for inequality constraints and
transparent objective-energy consistency.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
import numpy as np

try:
    from qiskit.quantum_info import SparsePauliOp
    HAS_QISKIT = True
except ImportError:
    HAS_QISKIT = False
    SparsePauliOp = Any

from waterweave.models import Scenario


@dataclass
class OptimizationModel:
    """Explicit binary quadratic model for WATERWEAVE water allocation.

    Attributes:
        scenario: The input Scenario.
        fairness_weight: Weight alpha for service-level disparity penalty.
        penalty_weight: Penalty weight P for violated supply/storage constraints.
        decision_vars: List of (neighborhood_id, slot) tuples for active binary decisions.
        slack_vars: List of descriptions for slack variables used to encode inequalities.
        var_names: All variable names in order (decision variables first, then slacks).
        n_decision: Number of decision variables.
        n_slack: Number of slack variables.
        n_vars: Total number of binary variables (qubits).
        offset: Constant scalar in QUBO: f(z) = z^T Q z + c^T z + offset.
        linear_coeffs: 1D array of shape (n_vars,) representing linear coefficients c.
        quadratic_matrix: 2D upper-triangular array of shape (n_vars, n_vars) for Q.
        ising_offset: Constant scalar in Ising Hamiltonian H = sum h_i Z_i + sum J_ij Z_i Z_j + offset_H.
        ising_h: 1D array of shape (n_vars,) representing single-qubit Z coefficients h.
        ising_J: 2D upper-triangular array of shape (n_vars, n_vars) representing two-qubit ZZ interactions J.
    """
    scenario: Scenario
    fairness_weight: float
    penalty_weight: float
    decision_vars: list[tuple[str, str]]
    slack_vars: list[str]
    var_names: list[str]
    n_decision: int
    n_slack: int
    n_vars: int
    offset: float
    linear_coeffs: np.ndarray
    quadratic_matrix: np.ndarray
    ising_offset: float
    ising_h: np.ndarray
    ising_J: np.ndarray


def compute_default_penalty_weight(
    scenario: Scenario,
    fairness_weight: float = 2.0,
) -> float:
    """Derive a penalty weight P guaranteeing that feasible states dominate infeasible states.

    A single constraint violation yields penalty P * (1)^2 = P.
    Every feasible state has objective <= F(empty) = sum_i w_i * D_i.
    Any infeasible state has base objective >= 0 and violation >= 1, so
    F(infeasible) >= P.
    Setting P >= max(15.0, sum_i w_i * D_i + 1.0, 2.0 * max_i(w_i) + fairness_weight)
    strictly guarantees that every infeasible state has higher energy than
    the optimal feasible state across arbitrary scenario dimensions.
    """
    max_w = (
        max(n.priority_weight for n in scenario.neighborhoods)
        if scenario.neighborhoods
        else 1.0
    )
    total_unserved_shortage = sum(
        n.priority_weight * sum(n.demand_by_slot.get(t, 0) for t in scenario.slots)
        for n in scenario.neighborhoods
    )
    return float(max(15.0, total_unserved_shortage + 1.0, 2.0 * max_w + fairness_weight))



def build_model(
    scenario: Scenario,
    fairness_weight: float = 2.0,
    penalty_weight: float | None = None,
) -> OptimizationModel:
    """Construct an explicit QUBO and Ising model for the given Scenario.

    Variables:
    - Primary decision variables x[i, t] in {0, 1} are created ONLY for (i, t)
      where neighborhood i has demand > 0 in slot t.
    - Slack variables s_k in {0, 1} are introduced to convert supply and storage
      inequalities sum(x) <= B into exact equalities sum(x) + sum(s) = B.

    Objective:
        Minimize:
          Weighted Shortage + alpha * Disparity + P * Constraint Penalties
    """
    if penalty_weight is None:
        penalty_weight = compute_default_penalty_weight(scenario, fairness_weight=fairness_weight)

    # 1. Identify active decision variables: only where demand > 0
    decision_vars: list[tuple[str, str]] = []
    for n in scenario.neighborhoods:
        for t in scenario.slots:
            if n.demand_by_slot.get(t, 0) > 0:
                decision_vars.append((n.id, t))

    n_decision = len(decision_vars)
    var_map: dict[tuple[str, str], int] = {v: idx for idx, v in enumerate(decision_vars)}

    # Neighborhood lookups
    n_by_id = {n.id: n for n in scenario.neighborhoods}
    demands: dict[str, int] = {
        n.id: sum(n.demand_by_slot.get(t, 0) for t in scenario.slots)
        for n in scenario.neighborhoods
    }
    weights: dict[str, float] = {n.id: n.priority_weight for n in scenario.neighborhoods}
    capacities: dict[str, int] = {n.id: n.storage_capacity_units for n in scenario.neighborhoods}

    # 2. Identify inequality constraints and required slack variables
    # We only need slack variables if the maximum possible variable sum exceeds the bound.
    slack_vars: list[str] = []
    constraint_specs: list[dict[str, Any]] = []

    # Slot supply constraints: sum_{i} x[i, t] <= S_t
    for t in scenario.slots:
        supply_limit = scenario.supply_by_slot.get(t, 0)
        participating_vars = [
            var_map[(n.id, t)]
            for n in scenario.neighborhoods
            if (n.id, t) in var_map
        ]
        u_bound = len(participating_vars)
        if u_bound > supply_limit:
            slack_indices: list[int] = []
            if supply_limit > 0:
                # Slack needed: S_t - sum(x) in {0, ..., S_t}
                needed_slack = supply_limit
                for s_idx in range(needed_slack):
                    slack_name = f"slack_supply_{t}_{s_idx}"
                    slack_vars.append(slack_name)
                    slack_indices.append(n_decision + len(slack_vars) - 1)
            constraint_specs.append({
                "name": f"supply_{t}",
                "var_indices": participating_vars + slack_indices,
                "coeffs": [1.0] * len(participating_vars) + [1.0] * len(slack_indices),
                "bound": float(supply_limit),
            })

    # Neighborhood storage constraints: sum_{t} x[i, t] <= C_i
    for n in scenario.neighborhoods:
        cap = capacities[n.id]
        participating_vars = [
            var_map[(n.id, t)]
            for t in scenario.slots
            if (n.id, t) in var_map
        ]
        u_bound = len(participating_vars)
        if u_bound > cap:
            slack_indices = []
            if cap > 0:
                needed_slack = cap
                for s_idx in range(needed_slack):
                    slack_name = f"slack_storage_{n.id}_{s_idx}"
                    slack_vars.append(slack_name)
                    slack_indices.append(n_decision + len(slack_vars) - 1)
            constraint_specs.append({
                "name": f"storage_{n.id}",
                "var_indices": participating_vars + slack_indices,
                "coeffs": [1.0] * len(participating_vars) + [1.0] * len(slack_indices),
                "bound": float(cap),
            })

    n_slack = len(slack_vars)
    n_vars = n_decision + n_slack
    var_names = [f"x_{v[0]}_{v[1]}" for v in decision_vars] + list(slack_vars)

    # 3. Build QUBO components: offset, linear vector c, upper-triangular Q
    offset = 0.0
    c = np.zeros(n_vars, dtype=np.float64)
    Q = np.zeros((n_vars, n_vars), dtype=np.float64)

    # A. Weighted Shortage Term:
    # sum_i w_i (D_i - y_i) = sum_i w_i D_i - sum_k w_{i_k} x_k
    for nid, d in demands.items():
        offset += weights[nid] * float(d)
    for k, (nid, _) in enumerate(decision_vars):
        c[k] -= weights[nid]

    # B. Fairness Disparity Term:
    # alpha * sum_{i < j, D_i > 0, D_j > 0} (s_i - s_j)^2
    # where s_i = y_i / D_i = (1 / D_i) sum_{k: i_k = i} x_k
    active_nodes = [nid for nid, d in demands.items() if d > 0]
    m_act = len(active_nodes)
    if m_act > 1 and fairness_weight > 0.0:
        # Linear terms: for variable k, (m_act - 1) / D_{i_k}^2 * x_k
        for k, (nid_k, _) in enumerate(decision_vars):
            if demands[nid_k] > 0:
                c[k] += fairness_weight * (m_act - 1.0) / (demands[nid_k] ** 2)

        # Quadratic terms:
        for k in range(n_decision):
            nid_k = decision_vars[k][0]
            if demands[nid_k] <= 0:
                continue
            for l in range(k + 1, n_decision):
                nid_l = decision_vars[l][0]
                if demands[nid_l] <= 0:
                    continue
                if nid_k == nid_l:
                    # Same neighborhood cross term: 2 * (m_act - 1) / D_i^2
                    Q[k, l] += fairness_weight * 2.0 * (m_act - 1.0) / (demands[nid_k] ** 2)
                else:
                    # Different neighborhood cross term: -2 / (D_i * D_j)
                    Q[k, l] += fairness_weight * (-2.0) / (demands[nid_k] * demands[nid_l])

    # C. Quadratic Constraint Penalties:
    # P * (sum_v c_v z_v - B)^2
    # Expansion:
    # P * B^2 + sum_v P * (c_v^2 - 2 * B * c_v) z_v + 2 * P * sum_{u < v} c_u * c_v z_u z_v
    for spec in constraint_specs:
        b_val = spec["bound"]
        v_indices = spec["var_indices"]
        c_vals = spec["coeffs"]

        offset += penalty_weight * (b_val ** 2)
        for idx, coeff in zip(v_indices, c_vals):
            c[idx] += penalty_weight * (coeff ** 2 - 2.0 * b_val * coeff)

        for i_idx, u in enumerate(v_indices):
            for j_idx in range(i_idx + 1, len(v_indices)):
                v = v_indices[j_idx]
                mn, mx = min(u, v), max(u, v)
                Q[mn, mx] += 2.0 * penalty_weight * c_vals[i_idx] * c_vals[j_idx]

    # 4. Convert QUBO to Ising Hamiltonian:
    # z_k = (I - Z_k) / 2
    # offset_H = offset + 0.5 * sum(c) + 0.25 * sum(Q)
    # h_k = -0.5 * c_k - 0.25 * sum_{l != k} Q_{min(k,l), max(k,l)}
    # J_{k, l} = 0.25 * Q_{k, l}
    ising_offset = float(offset + 0.5 * np.sum(c) + 0.25 * np.sum(Q))
    ising_h = np.zeros(n_vars, dtype=np.float64)
    for k in range(n_vars):
        q_row_sum = sum(Q[min(k, l), max(k, l)] for l in range(n_vars) if l != k)
        ising_h[k] = -0.5 * c[k] - 0.25 * q_row_sum

    ising_J = 0.25 * Q

    return OptimizationModel(
        scenario=scenario,
        fairness_weight=fairness_weight,
        penalty_weight=penalty_weight,
        decision_vars=decision_vars,
        slack_vars=slack_vars,
        var_names=var_names,
        n_decision=n_decision,
        n_slack=n_slack,
        n_vars=n_vars,
        offset=float(offset),
        linear_coeffs=c,
        quadratic_matrix=Q,
        ising_offset=ising_offset,
        ising_h=ising_h,
        ising_J=ising_J,
    )


def decode_allocation(
    model: OptimizationModel,
    bitstring_or_bits: str | list[int] | np.ndarray,
) -> dict[str, dict[str, int]]:
    """Decode a measured bitstring or bit array into a nested allocation dict.

    Handles Qiskit endianness: if a string is provided (e.g., from Qiskit's
    StatevectorSampler), the rightmost character is bit 0.
    """
    if isinstance(bitstring_or_bits, str):
        # Qiskit measurement string: rightmost char is qubit 0
        bits = [int(ch) for ch in reversed(bitstring_or_bits)]
    else:
        bits = [int(b) for b in bitstring_or_bits]

    allocation: dict[str, dict[str, int]] = {
        n.id: {s: 0 for s in model.scenario.slots}
        for n in model.scenario.neighborhoods
    }

    for k, (nid, slot) in enumerate(model.decision_vars):
        if k < len(bits):
            allocation[nid][slot] = max(0, min(1, int(bits[k])))

    return allocation


def evaluate_objective(
    scenario: Scenario,
    allocation: dict[str, dict[str, int]],
    fairness_weight: float = 2.0,
    penalty_weight: float | None = None,
) -> float:
    """Evaluate the exact theoretical objective function for a given allocation.

    Objective:
        Weighted Shortage + alpha * Disparity + P * sum(violations^2)

    Penalties are summed across individual squared constraint violations:
        sum_t (supply_viol_t)^2 + sum_i (storage_viol_i)^2 + sum_{i,t} (demand_viol_{i,t})^2.
    This aligns mathematically with the quadratic binary formulation where each
    inequality is penalized by P * (sum x + sum s - B)^2 individually.
    """
    if penalty_weight is None:
        penalty_weight = compute_default_penalty_weight(scenario, fairness_weight=fairness_weight)

    total_shortage = 0.0
    service_levels: list[float] = []

    # Storage and demand violations
    storage_viol_sq = 0.0
    demand_viol_sq = 0.0
    for n in scenario.neighborhoods:
        nd = sum(n.demand_by_slot.get(t, 0) for t in scenario.slots)
        n_alloc = 0
        served = 0
        for t in scenario.slots:
            a = allocation.get(n.id, {}).get(t, 0)
            d = n.demand_by_slot.get(t, 0)
            n_alloc += a
            served += min(a, d)
            if a > d:
                demand_viol_sq += (a - d) ** 2
        if n_alloc > n.storage_capacity_units:
            storage_viol_sq += (n_alloc - n.storage_capacity_units) ** 2
        total_shortage += n.priority_weight * (nd - served)
        if nd > 0:
            service_levels.append(served / nd)

    # Supply violations (squared per slot)
    supply_viol_sq = 0.0
    for t in scenario.slots:
        used = sum(allocation.get(n.id, {}).get(t, 0) for n in scenario.neighborhoods)
        s_cap = scenario.supply_by_slot.get(t, 0)
        if used > s_cap:
            supply_viol_sq += (used - s_cap) ** 2

    # Disparity: sum_{i < j} (s_i - s_j)^2
    disparity = 0.0
    m_act = len(service_levels)
    if m_act > 1:
        for i in range(m_act):
            for j in range(i + 1, m_act):
                disparity += (service_levels[i] - service_levels[j]) ** 2

    # Total objective
    penalties = penalty_weight * (supply_viol_sq + storage_viol_sq + demand_viol_sq)
    return float(total_shortage + fairness_weight * disparity + penalties)


def evaluate_qubo_energy(
    model: OptimizationModel,
    bits: str | list[int] | np.ndarray,
) -> float:
    """Calculate the exact scalar energy z^T Q z + c^T z + offset."""
    if isinstance(bits, str):
        z = np.array([int(ch) for ch in reversed(bits)], dtype=np.float64)
    else:
        z = np.array(bits, dtype=np.float64)

    if len(z) < model.n_vars:
        padded = np.zeros(model.n_vars, dtype=np.float64)
        padded[:len(z)] = z
        z = padded
    elif len(z) > model.n_vars:
        z = z[:model.n_vars]

    linear_part = float(np.dot(model.linear_coeffs, z))
    quad_part = float(np.sum(model.quadratic_matrix * np.outer(z, z)))
    return float(model.offset + linear_part + quad_part)


def to_sparse_pauli_op(model: OptimizationModel) -> SparsePauliOp:
    """Convert the Ising Hamiltonian into a Qiskit SparsePauliOp.

    Qiskit Pauli string convention: rightmost character corresponds to qubit 0.
    """
    if not HAS_QISKIT:
        raise ImportError("Qiskit is required to generate SparsePauliOp.")

    n = model.n_vars
    if n == 0:
        return SparsePauliOp.from_list([("", 0.0)])

    pauli_list: list[tuple[str, float]] = []

    # Offset term: I * ... * I
    if abs(model.ising_offset) > 1e-12:
        pauli_list.append(("I" * n, model.ising_offset))

    # Single-qubit Z terms: h_k Z_k
    for k in range(n):
        if abs(model.ising_h[k]) > 1e-12:
            # Qubit k is at index (n - 1 - k) from left
            p_chars = ["I"] * n
            p_chars[n - 1 - k] = "Z"
            pauli_list.append(("".join(p_chars), model.ising_h[k]))

    # Two-qubit ZZ terms: J_{k, l} Z_k Z_l
    for k in range(n):
        for l in range(k + 1, n):
            if abs(model.ising_J[k, l]) > 1e-12:
                p_chars = ["I"] * n
                p_chars[n - 1 - k] = "Z"
                p_chars[n - 1 - l] = "Z"
                pauli_list.append(("".join(p_chars), model.ising_J[k, l]))

    if len(pauli_list) == 0:
        pauli_list.append(("I" * n, 0.0))

    return SparsePauliOp.from_list(pauli_list)
