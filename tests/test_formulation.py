"""Tests for waterweave.formulation: QUBO, Ising mapping, and slack encodings."""

import itertools
import numpy as np
import pytest

from waterweave.formulation import (
    build_model,
    decode_allocation,
    evaluate_objective,
    evaluate_qubo_energy,
    to_sparse_pauli_op,
)
from waterweave.metrics import evaluate_allocation
from waterweave.models import Neighborhood, Scenario
from waterweave.scenarios import default_scenario

S = default_scenario()


def test_decision_variable_creation():
    """Verify variables are created ONLY for (neighborhood, slot) with positive demand."""
    model = build_model(S)
    # Default scenario: N1 has 2, N2 has 2, N3 has 1 (morning only), N4 has 2. Total 7.
    assert model.n_decision == 7
    assert ("N3", "evening") not in model.decision_vars
    assert ("N3", "morning") in model.decision_vars


def test_slack_variable_count():
    """Verify correct slack variable count for supply and binding storage constraints."""
    model = build_model(S)
    # Morning supply: 4 vars, cap 2 -> 2 slacks
    # Evening supply: 3 vars, cap 2 -> 2 slacks
    # N2 storage: 2 vars, cap 1 -> 1 slack
    # N1, N3, N4 storage cannot bind (cap >= eligible vars) -> 0 slacks
    # Total slacks = 2 + 2 + 1 = 5
    assert model.n_slack == 5
    assert model.n_vars == 12


def test_disparity_algebraic_identity():
    """Verify that the quadratic disparity expansion matches direct calculation."""
    model = build_model(S, fairness_weight=1.0, penalty_weight=0.0)

    # Pick several arbitrary decision bit assignments
    for bits in [
        [1, 0, 1, 0, 1, 1, 0],
        [0, 1, 0, 1, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1],
        [0, 0, 0, 0, 0, 0, 0],
    ]:
        alloc = decode_allocation(model, bits)
        # Direct disparity calculation:
        demands = {n.id: sum(n.demand_by_slot.values()) for n in S.neighborhoods}
        serv = {n.id: sum(alloc[n.id][s] for s in S.slots) for n in S.neighborhoods}
        s = [serv[n.id] / demands[n.id] for n in S.neighborhoods]
        direct_disp = sum((s[i] - s[j]) ** 2 for i in range(len(s)) for j in range(i + 1, len(s)))

        # Quadratic model disparity (subtracting shortage portion)
        shortage = sum(n.priority_weight * (demands[n.id] - serv[n.id]) for n in S.neighborhoods)
        # Pad with zeros for slacks
        z = np.zeros(model.n_vars)
        z[:7] = bits
        energy = evaluate_qubo_energy(model, z)
        model_disp = energy - shortage
        assert model_disp == pytest.approx(direct_disp, abs=1e-6)


def test_qubo_energy_matches_objective_for_all_feasible_allocations():
    """Verify that for every feasible allocation, the minimal QUBO slack energy matches evaluate_objective."""
    model = build_model(S, fairness_weight=2.0, penalty_weight=15.0)

    feasible_checked = 0
    for dec_bits in itertools.product([0, 1], repeat=model.n_decision):
        alloc = decode_allocation(model, list(dec_bits))
        m = evaluate_allocation(S, alloc)
        if m["feasible"] == 1.0:
            feasible_checked += 1
            obj = evaluate_objective(S, alloc, fairness_weight=2.0, penalty_weight=15.0)

            # Minimum energy over slack variable settings
            min_e = float("inf")
            for slack_bits in itertools.product([0, 1], repeat=model.n_slack):
                full_bits = list(dec_bits) + list(slack_bits)
                e = evaluate_qubo_energy(model, full_bits)
                if e < min_e:
                    min_e = e

            assert min_e == pytest.approx(obj, abs=1e-6)

    assert feasible_checked == 65


def test_penalty_weight_dominance():
    """Verify that every infeasible allocation has higher energy than the optimal feasible state."""
    model = build_model(S, fairness_weight=2.0, penalty_weight=15.0)

    min_feasible_energy = float("inf")
    min_infeasible_energy = float("inf")

    for dec_bits in itertools.product([0, 1], repeat=model.n_decision):
        alloc = decode_allocation(model, list(dec_bits))
        m = evaluate_allocation(S, alloc)

        min_e = float("inf")
        for slack_bits in itertools.product([0, 1], repeat=model.n_slack):
            full_bits = list(dec_bits) + list(slack_bits)
            e = evaluate_qubo_energy(model, full_bits)
            if e < min_e:
                min_e = e

        if m["feasible"] == 1.0:
            if min_e < min_feasible_energy:
                min_feasible_energy = min_e
        else:
            if min_e < min_infeasible_energy:
                min_infeasible_energy = min_e

    assert min_feasible_energy == pytest.approx(6.0)
    assert min_infeasible_energy > min_feasible_energy
    assert min_infeasible_energy >= 19.5


def test_decode_allocation_endianness():
    """Verify little-endian decoding from Qiskit measurement string."""
    model = build_model(S)
    # Bit 0 is rightmost in bitstring: '...0001' sets variable 0 to 1
    # Variable 0 is (N1, morning)
    alloc_0 = decode_allocation(model, "000000000001")
    assert alloc_0["N1"]["morning"] == 1
    assert alloc_0["N1"]["evening"] == 0

    # Bit 6 is 7th from right: variable 6 is (N4, evening)
    # index: 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0
    # bit 6 is '1' in '000001000000'
    alloc_6 = decode_allocation(model, "000001000000")
    assert alloc_6["N4"]["evening"] == 1


def test_sparse_pauli_op_generation():
    """Verify SparsePauliOp operator matches Ising model parameters."""
    model = build_model(S)
    H = to_sparse_pauli_op(model)
    assert H.num_qubits == model.n_vars
    assert len(H) > 0
