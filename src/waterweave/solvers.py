"""Solvers for the WATERWEAVE water-allocation problem.

Provides:
- solve_greedy: Priority-first classical heuristic baseline.
- solve_exact: Global optimal classical solver via exhaustive binary enumeration.
- solve_qaoa: Quantum Approximate Optimization Algorithm using native Qiskit circuits and primitives.
"""

from __future__ import annotations

import itertools
import time
from typing import Any
import numpy as np
import scipy.optimize

try:
    from qiskit import QuantumCircuit
    from qiskit.quantum_info import Statevector
    from qiskit.primitives import StatevectorSampler
    HAS_QISKIT = True
except ImportError:
    HAS_QISKIT = False

from waterweave.formulation import (
    OptimizationModel,
    build_model,
    compute_default_penalty_weight,
    decode_allocation,
    evaluate_objective,
    evaluate_qubo_energy,
    to_sparse_pauli_op,
)
from waterweave.metrics import evaluate_allocation
from waterweave.models import Scenario, SolverResult


def solve_greedy(
    scenario: Scenario,
    fairness_weight: float = 2.0,
    penalty_weight: float | None = None,
) -> SolverResult:
    """Objective-aware greedy allocation heuristic with deterministic local refinement.

    Constructs a feasible allocation by forward greedy selection guided by marginal
    objective reduction (balancing weighted shortage and service-level disparity),
    evaluates against the priority-first heuristic and zero-allocation baseline to prevent
    dominated outcomes, and applies deterministic 1-opt local refinement.
    Allocations are discrete binary decisions (at most 1 unit per slot), matching the exact
    decision space of the exact and QAOA solvers.
    """
    t0 = time.perf_counter()
    if penalty_weight is None:
        penalty_weight = compute_default_penalty_weight(scenario, fairness_weight=fairness_weight)

    empty_alloc: dict[str, dict[str, int]] = {
        n.id: {s: 0 for s in scenario.slots}
        for n in scenario.neighborhoods
    }

    # 1. Candidate A: Pure priority-first allocation
    pf_alloc = {
        n.id: {s: 0 for s in scenario.slots}
        for n in scenario.neighborhoods
    }
    sorted_neighbors = sorted(
        scenario.neighborhoods,
        key=lambda n: n.priority_weight,
        reverse=True,
    )
    for slot in scenario.slots:
        supply_left = scenario.supply_by_slot.get(slot, 0)
        for n in sorted_neighbors:
            if supply_left <= 0:
                break
            demand = n.demand_by_slot.get(slot, 0)
            if demand <= 0:
                continue
            cur = sum(pf_alloc[n.id].values())
            room = max(0, n.storage_capacity_units - cur)
            units = min(1, demand, supply_left, room)
            if units > 0:
                pf_alloc[n.id][slot] = units
                supply_left -= units

    # 2. Candidate B: Forward greedy selection minimizing total objective F(x)
    fwd_alloc = {
        n.id: {s: 0 for s in scenario.slots}
        for n in scenario.neighborhoods
    }
    while True:
        cur_obj = evaluate_objective(
            scenario, fwd_alloc, fairness_weight=fairness_weight, penalty_weight=penalty_weight
        )
        best_cand = None
        for n in scenario.neighborhoods:
            for s in scenario.slots:
                if fwd_alloc[n.id][s] == 0 and n.demand_by_slot.get(s, 0) > 0:
                    cand = {nid: dict(slots) for nid, slots in fwd_alloc.items()}
                    cand[n.id][s] = 1
                    m = evaluate_allocation(scenario, cand)
                    if m["feasible"] == 1.0:
                        cand_obj = evaluate_objective(
                            scenario, cand, fairness_weight=fairness_weight, penalty_weight=penalty_weight
                        )
                        if cand_obj < cur_obj - 1e-9:
                            if best_cand is None or cand_obj < best_cand[0]:
                                best_cand = (cand_obj, n.id, s)
        if best_cand is not None:
            fwd_alloc[best_cand[1]][best_cand[2]] = 1
        else:
            break

    # 3. Select best feasible candidate among Empty, Priority-First, and Forward Greedy
    candidates = [empty_alloc, pf_alloc, fwd_alloc]
    evaluated_candidates = []
    for cand in candidates:
        m = evaluate_allocation(scenario, cand)
        if m["feasible"] == 1.0:
            obj = evaluate_objective(
                scenario, cand, fairness_weight=fairness_weight, penalty_weight=penalty_weight
            )
            evaluated_candidates.append((obj, cand))

    if not evaluated_candidates:
        chosen_alloc = empty_alloc
    else:
        evaluated_candidates.sort(key=lambda item: item[0])
        chosen_alloc = evaluated_candidates[0][1]

    # 4. Deterministic 1-opt local refinement (swaps and removals)
    while True:
        cur_obj = evaluate_objective(
            scenario, chosen_alloc, fairness_weight=fairness_weight, penalty_weight=penalty_weight
        )
        best_improvement = None

        # Check 1-unit removals
        for n1 in scenario.neighborhoods:
            for s1 in scenario.slots:
                if chosen_alloc[n1.id][s1] == 1:
                    cand = {nid: dict(slots) for nid, slots in chosen_alloc.items()}
                    cand[n1.id][s1] = 0
                    m = evaluate_allocation(scenario, cand)
                    if m["feasible"] == 1.0:
                        c_obj = evaluate_objective(
                            scenario, cand, fairness_weight=fairness_weight, penalty_weight=penalty_weight
                        )
                        if c_obj < cur_obj - 1e-9:
                            if best_improvement is None or c_obj < best_improvement[0]:
                                best_improvement = (c_obj, cand)

        # Check 1-unit swaps
        for n1 in scenario.neighborhoods:
            for s1 in scenario.slots:
                if chosen_alloc[n1.id][s1] == 1:
                    for n2 in scenario.neighborhoods:
                        for s2 in scenario.slots:
                            if chosen_alloc[n2.id][s2] == 0 and n2.demand_by_slot.get(s2, 0) > 0:
                                cand = {nid: dict(slots) for nid, slots in chosen_alloc.items()}
                                cand[n1.id][s1] = 0
                                cand[n2.id][s2] = 1
                                m = evaluate_allocation(scenario, cand)
                                if m["feasible"] == 1.0:
                                    c_obj = evaluate_objective(
                                        scenario, cand, fairness_weight=fairness_weight, penalty_weight=penalty_weight
                                    )
                                    if c_obj < cur_obj - 1e-9:
                                        if best_improvement is None or c_obj < best_improvement[0]:
                                            best_improvement = (c_obj, cand)

        if best_improvement is not None:
            chosen_alloc = best_improvement[1]
        else:
            break

    runtime = time.perf_counter() - t0
    metrics = evaluate_allocation(scenario, chosen_alloc)
    objective = evaluate_objective(
        scenario, chosen_alloc, fairness_weight=fairness_weight, penalty_weight=penalty_weight
    )

    return SolverResult(
        solver_name="Greedy (Priority-First)",
        allocation=chosen_alloc,
        objective_value=float(objective),
        feasible=bool(metrics["feasible"] == 1.0),
        metrics=metrics,
        runtime_seconds=float(runtime),
        metadata={
            "solver_type": "classical_heuristic",
            "heuristic": "objective_aware_greedy_with_local_search",
            "is_demo": False,
            "description": (
                "Objective-aware greedy heuristic with deterministic 1-opt local search. "
                "Evaluates allocations against the shared objective (shortage, disparity, penalties) "
                "and guards against returning solutions dominated by the zero-allocation baseline."
            ),
        },
    )


def solve_exact(
    scenario: Scenario,
    fairness_weight: float = 2.0,
    penalty_weight: float | None = None,
) -> SolverResult:
    """Exact classical solver using exhaustive enumeration of eligible binary decisions.

    Guarantees the global minimum of the combined objective function
    (Weighted Shortage + alpha * Disparity + P * Violations).
    """
    t0 = time.perf_counter()
    if penalty_weight is None:
        penalty_weight = compute_default_penalty_weight(scenario, fairness_weight=fairness_weight)

    model = build_model(
        scenario, fairness_weight=fairness_weight, penalty_weight=penalty_weight
    )

    if model.n_decision == 0:
        # Zero active decision variables (e.g. zero demand scenario)
        empty_alloc: dict[str, dict[str, int]] = {
            n.id: {s: 0 for s in scenario.slots}
            for n in scenario.neighborhoods
        }
        metrics = evaluate_allocation(scenario, empty_alloc)
        runtime = time.perf_counter() - t0
        return SolverResult(
            solver_name="Exact Classical (Optimal)",
            allocation=empty_alloc,
            objective_value=0.0,
            feasible=True,
            metrics=metrics,
            runtime_seconds=float(runtime),
            metadata={
                "solver_type": "classical_exact",
                "method": "trivial_empty",
                "total_candidates_evaluated": 1,
                "is_demo": False,
            },
        )

    best_alloc: dict[str, dict[str, int]] | None = None
    best_obj = float("inf")
    best_metrics: dict[str, float] | None = None
    best_feasible = False
    candidates_count = 0

    # Exhaustive search over all 2^(n_decision) binary combinations
    for bits in itertools.product([0, 1], repeat=model.n_decision):
        candidates_count += 1
        alloc = decode_allocation(model, list(bits))
        m = evaluate_allocation(scenario, alloc)
        obj = evaluate_objective(
            scenario, alloc, fairness_weight=fairness_weight, penalty_weight=penalty_weight
        )

        is_feas = (m["feasible"] == 1.0)
        if is_feas:
            if (
                not best_feasible
                or obj < best_obj - 1e-9
                or (
                    abs(obj - best_obj) <= 1e-9
                    and best_metrics is not None
                    and m["fairness_score"] > best_metrics["fairness_score"]
                )
            ):
                best_obj = obj
                best_alloc = alloc
                best_metrics = m
                best_feasible = True
        elif not best_feasible and obj < best_obj - 1e-9:
            best_obj = obj
            best_alloc = alloc
            best_metrics = m

    runtime = time.perf_counter() - t0

    if best_alloc is None or best_metrics is None:
        best_alloc = {
            n.id: {s: 0 for s in scenario.slots}
            for n in scenario.neighborhoods
        }
        best_metrics = evaluate_allocation(scenario, best_alloc)
        best_obj = evaluate_objective(
            scenario, best_alloc, fairness_weight=fairness_weight, penalty_weight=penalty_weight
        )

    return SolverResult(
        solver_name="Exact Classical (Optimal)",
        allocation=best_alloc,
        objective_value=float(best_obj),
        feasible=bool(best_feasible),
        metrics=best_metrics,
        runtime_seconds=float(runtime),
        metadata={
            "solver_type": "classical_exact",
            "method": "exhaustive_enumeration",
            "total_candidates_evaluated": candidates_count,
            "is_demo": False,
            "description": (
                "Exact enumeration evaluating all eligible binary allocation configurations "
                "to guarantee finding the global minimum."
            ),
        },
    )


def _build_qaoa_circuit(
    model: OptimizationModel,
    gammas: list[float],
    betas: list[float],
) -> QuantumCircuit:
    """Build a parameterized or assigned QAOA circuit with explicit Hamiltonian gates."""
    n = model.n_vars
    p = len(gammas)
    qc = QuantumCircuit(n)

    # Initial state: |+>^n
    qc.h(range(n))

    for layer in range(p):
        gamma = gammas[layer]
        beta = betas[layer]

        # Cost unitary e^{-i gamma H_C}
        # Two-qubit ZZ interactions
        for k in range(n):
            for l in range(k + 1, n):
                j_val = model.ising_J[k, l]
                if abs(j_val) > 1e-9:
                    qc.rzz(2.0 * gamma * j_val, k, l)
        # Single-qubit Z rotations
        for k in range(n):
            h_val = model.ising_h[k]
            if abs(h_val) > 1e-9:
                qc.rz(2.0 * gamma * h_val, k)

        # Mixer unitary e^{-i beta sum X}
        for k in range(n):
            qc.rx(2.0 * beta, k)

    return qc


def solve_qaoa(
    scenario: Scenario,
    p: int = 1,
    shots: int = 1024,
    maxiter: int = 25,
    fairness_weight: float = 2.0,
    penalty_weight: float | None = None,
    seed: int = 42,
) -> SolverResult:
    """Quantum Approximate Optimization Algorithm (QAOA) solver using Qiskit.

    Executes a p-layer QAOA workflow:
    1. Builds QUBO/Ising model with slack-variable encoding.
    2. Optimizes variational parameters (gamma, beta) using classical optimizer (COBYLA)
       with grid warm-start to escape shallow local minima.
    3. Simulates the optimal circuit and samples bitstrings using StatevectorSampler.
    4. Decodes sampled bitstrings into water allocations, enforces constraint validation,
       and verifies objective-energy consistency on candidate states.
    5. Returns transparent metrics, sampling statistics, and circuit metadata.
    """
    t0 = time.perf_counter()

    if not HAS_QISKIT:
        empty_alloc = {n.id: {s: 0 for s in scenario.slots} for n in scenario.neighborhoods}
        empty_m = evaluate_allocation(scenario, empty_alloc)
        empty_m["feasible"] = 0.0
        return SolverResult(
            solver_name="QAOA (Quantum Heuristic)",
            allocation=empty_alloc,
            objective_value=float("inf"),
            feasible=False,
            metrics=empty_m,
            runtime_seconds=0.0,
            metadata={
                "solver_type": "quantum_approximate",
                "is_demo": False,
                "error": "Qiskit is not installed in the current environment.",
            },
        )

    try:
        if not isinstance(p, int) or p < 1:
            raise ValueError(f"p must be a positive integer (received {p}).")
        if not isinstance(shots, int) or shots < 1:
            raise ValueError(f"shots must be a positive integer (received {shots}).")
        if not isinstance(maxiter, int) or maxiter < 1:
            raise ValueError(f"maxiter must be a positive integer (received {maxiter}).")
        if not isinstance(fairness_weight, (int, float)) or fairness_weight < 0:
            raise ValueError(f"fairness_weight must be non-negative (received {fairness_weight}).")
        if penalty_weight is not None and (not isinstance(penalty_weight, (int, float)) or penalty_weight <= 0):
            raise ValueError(f"penalty_weight must be positive (received {penalty_weight}).")
        if penalty_weight is None:
            penalty_weight = compute_default_penalty_weight(scenario, fairness_weight=fairness_weight)

        model = build_model(
            scenario, fairness_weight=fairness_weight, penalty_weight=penalty_weight
        )

        if model.n_vars == 0:
            # Trivial instance with no variables
            empty_alloc = {n.id: {s: 0 for s in scenario.slots} for n in scenario.neighborhoods}
            return SolverResult(
                solver_name="QAOA (Quantum Heuristic)",
                allocation=empty_alloc,
                objective_value=0.0,
                feasible=True,
                metrics=evaluate_allocation(scenario, empty_alloc),
                runtime_seconds=float(time.perf_counter() - t0),
                metadata={
                    "solver_type": "quantum_approximate",
                    "layers_p": p,
                    "shots": shots,
                    "num_qubits": 0,
                    "is_demo": False,
                },
            )

        n = model.n_vars

        # Variational objective function: expectation value <H_C>
        if n <= 14:
            # For small instances, precompute diagonal Hamiltonian energy vector for fast evaluation
            states = np.arange(2 ** n)
            bits_matrix = ((states[:, None] >> np.arange(n)) & 1).astype(float)
            energy_vector = (
                model.offset
                + bits_matrix @ model.linear_coeffs
                + np.sum((bits_matrix @ model.quadratic_matrix) * bits_matrix, axis=1)
            )

            def expectation_cost(params: np.ndarray) -> float:
                gammas = list(params[:p])
                betas = list(params[p:])
                qc = _build_qaoa_circuit(model, gammas, betas)
                sv = Statevector.from_instruction(qc)
                probs = sv.probabilities()
                return float(np.dot(probs, energy_vector))
        else:
            # For larger instances, use native SparsePauliOp expectation value to avoid large memory tables
            hamiltonian_op = to_sparse_pauli_op(model)

            def expectation_cost(params: np.ndarray) -> float:
                gammas = list(params[:p])
                betas = list(params[p:])
                qc = _build_qaoa_circuit(model, gammas, betas)
                sv = Statevector.from_instruction(qc)
                return float(sv.expectation_value(hamiltonian_op).real)

        # Warm-start search for initial variational parameters to avoid poor local minima
        np.random.seed(seed)
        best_init = np.concatenate([np.full(p, 0.3), np.full(p, 0.3)])
        best_init_cost = float("inf")

        # Fast grid evaluation over (gamma, beta)
        g_candidates = np.linspace(0.2, 1.2, 6)
        b_candidates = np.linspace(0.2, 1.2, 6)
        for g_val in g_candidates:
            for b_val in b_candidates:
                cand = np.concatenate([np.full(p, g_val), np.full(p, b_val)])
                c_val = expectation_cost(cand)
                if c_val < best_init_cost:
                    best_init_cost = c_val
                    best_init = cand

        # Classical parameter optimization starting from warm-start basin
        opt_res = scipy.optimize.minimize(
            expectation_cost,
            best_init,
            method="COBYLA",
            options={"maxiter": maxiter},
        )

        opt_gammas = [float(g) for g in opt_res.x[:p]]
        opt_betas = [float(b) for b in opt_res.x[p:]]

        # Execute optimal circuit with measurement
        circuit = _build_qaoa_circuit(model, opt_gammas, opt_betas)
        meas_circuit = circuit.copy()
        meas_circuit.measure_all()

        if shots <= 0:
            raise ValueError(f"Measurement shots must be positive (received {shots}).")

        sampler = StatevectorSampler(seed=seed)
        job = sampler.run([(meas_circuit, [])], shots=shots)
        pub_res = job.result()[0]
        counts = pub_res.data.meas.get_counts()

        if not counts:
            raise ValueError("StatevectorSampler returned empty measurement counts.")

        modal_bitstring = max(counts.items(), key=lambda kv: kv[1])[0]

        # Evaluate all sampled bitstrings
        feasible_shot_count = 0
        candidate_results: list[dict[str, Any]] = []

        for bs, count in counts.items():
            alloc = decode_allocation(model, bs)
            m = evaluate_allocation(scenario, alloc)
            obj = evaluate_objective(
                scenario, alloc, fairness_weight=fairness_weight, penalty_weight=penalty_weight
            )
            q_energy = evaluate_qubo_energy(model, bs)

            is_feas = (m["feasible"] == 1.0)
            if is_feas:
                feasible_shot_count += count

            is_consistent = is_feas and (abs(q_energy - obj) < 1e-5)
            candidate_results.append({
                "bitstring": bs,
                "count": count,
                "allocation": alloc,
                "metrics": m,
                "objective": obj,
                "qubo_energy": q_energy,
                "feasible": is_feas,
                "slack_consistent": is_consistent,
            })

        # Selection priority:
        # 1. Feasible allocations
        # 2. Consistent slack variables (objective matches QUBO energy)
        # 3. Lowest objective value, breaking ties by lowest QUBO energy and higher count
        feasible_candidates = [c for c in candidate_results if c["feasible"]]
        if feasible_candidates:
            consistent_feasible = [c for c in feasible_candidates if c["slack_consistent"]]
            if consistent_feasible:
                consistent_feasible.sort(key=lambda c: (c["objective"], -c["count"]))
                chosen = consistent_feasible[0]
            else:
                feasible_candidates.sort(key=lambda c: (c["objective"], c["qubo_energy"], -c["count"]))
                chosen = feasible_candidates[0]
        else:
            candidate_results.sort(key=lambda c: (c["objective"], c["qubo_energy"], -c["count"]))
            chosen = candidate_results[0]

        runtime = time.perf_counter() - t0
        feasible_ratio = feasible_shot_count / float(shots) if shots > 0 else 0.0

        modal_alloc = decode_allocation(model, modal_bitstring)
        modal_m = evaluate_allocation(scenario, modal_alloc)
        modal_obj = evaluate_objective(
            scenario, modal_alloc, fairness_weight=fairness_weight, penalty_weight=penalty_weight
        )
        modal_feasible = bool(modal_m["feasible"] == 1.0)
        opt_converged = bool(opt_res.nfev < maxiter)
        opt_status = "converged" if opt_converged else "maxiter_reached"

        return SolverResult(
            solver_name="QAOA (Quantum Heuristic)",
            allocation=chosen["allocation"],
            objective_value=float(chosen["objective"]),
            feasible=bool(chosen["feasible"]),
            metrics=chosen["metrics"],
            runtime_seconds=float(runtime),
            metadata={
                "solver_type": "quantum_approximate",
                "layers_p": p,
                "shots": shots,
                "seed": seed,
                "num_qubits": model.n_vars,
                "circuit_depth": circuit.depth(),
                "optimizer": "COBYLA",
                "optimizer_iterations": int(opt_res.nfev),
                "optimizer_converged": opt_converged,
                "optimizer_status": opt_status,
                "grid_evaluations": 36,
                "total_evaluations": 36 + int(opt_res.nfev),
                "optimal_gammas": opt_gammas,
                "optimal_betas": opt_betas,
                "sampled_unique_bitstrings": len(counts),
                "feasible_samples_ratio": float(feasible_ratio),
                "modal_bitstring": modal_bitstring,
                "modal_bitstring_feasible": modal_feasible,
                "modal_bitstring_objective": float(modal_obj),
                "modal_bitstring_count": int(counts[modal_bitstring]),
                "selection_rule": "best_feasible_slack_consistent",
                "best_bitstring": chosen["bitstring"],
                "qubo_energy": float(chosen["qubo_energy"]),
                "slack_consistent": bool(chosen["slack_consistent"]),
                "fairness_weight": float(fairness_weight),
                "penalty_weight": float(penalty_weight),
                "is_demo": False,
                "quantum_advantage_claimed": False,
                "notes": (
                    "Genuine QAOA workflow with explicit Hamiltonian circuit execution. "
                    "Executed on a classical statevector simulator, not quantum hardware. "
                    "No quantum advantage is claimed. The reported allocation is the best "
                    "feasible bitstring among the sampled shots, selected by classical "
                    "post-processing; the most frequent bitstring is reported separately."
                ),
            },
        )

    except Exception as exc:
        runtime = time.perf_counter() - t0
        empty_alloc = {n.id: {s: 0 for s in scenario.slots} for n in scenario.neighborhoods}
        empty_metrics = evaluate_allocation(scenario, empty_alloc)
        empty_metrics["feasible"] = 0.0  # Clearly mark as non-feasible on solver failure
        return SolverResult(
            solver_name="QAOA (Quantum Heuristic)",
            allocation=empty_alloc,
            objective_value=float("inf"),
            feasible=False,
            metrics=empty_metrics,
            runtime_seconds=float(runtime),
            metadata={
                "solver_type": "quantum_approximate",
                "layers_p": p,
                "shots": shots,
                "is_demo": False,
                "error": f"{type(exc).__name__}: {str(exc)}",
            },
        )
