# Quantum method as implemented

This document describes what the code actually does, not what a QAOA
tutorial would do. It was written by reading and executing the optimization
engine on branch `codex/optimization` at commit `9633518` (not merged to
`main` when this was written; the commit is also recorded in every
benchmark JSON under `meta.provenance`). Every numerical statement below is
either derived in the text or reproduced by `scripts/benchmark.py`.

All data is **synthetic**. This is a classical statevector simulation of a
12-qubit circuit; it says nothing about quantum hardware and it does **not**
demonstrate quantum advantage.

Source files: `src/waterweave/formulation.py` (model, QUBO, Ising),
`src/waterweave/solvers.py` (greedy, exact, QAOA),
`src/waterweave/optimization.py` (`run_comparison`).

---

## 1. Decision variables

One binary variable `x[i,t]` means "neighborhood `i` receives **one**
allocation unit in slot `t`". A variable exists only where
`demand_by_slot[t] >= 1` (PROJECT_SPEC.md). Variables are ordered by
neighborhood, then slot. Because each variable is a single bit, a slot
demand above 1 cannot be fully served; the default scenario therefore uses
demands in {0, 1}.

Default scenario: `K = 7` decision variables
(N1: 2, N2: 2, N3: 1, N4: 2).

## 2. Objective

For an allocation `x`, with `y_i = sum_t x[i,t]`, `D_i = sum_t d[i,t]`,
`s_i = y_i / D_i` (neighborhoods with `D_i > 0`, `m` of them):

```
F(x) = sum_i w_i (D_i - y_i)                     weighted shortage
     + alpha * sum_{i<j} (s_i - s_j)^2           service-level disparity
     + P * [ sum_t (supply_t violation)^2
           + sum_i (storage_i violation)^2 ]     constraint penalties
```

with `alpha = 2.0` and `P = max(15, 2 max_i w_i + alpha) = 15.0` by default.
These are tuning constants, not derived from data (see `VALIDATION.md`).

The first two terms are exactly quadratic in the bits:
`s_i^2 = (1/D_i^2)(sum_k x_k + 2 sum_{k<l} x_k x_l)` over the variables of
`i` (using `x^2 = x`), and `sum_{i<j}(s_i - s_j)^2 = (m-1) sum_i s_i^2 - 2
sum_{i<j} s_i s_j`. The code uses these coefficients directly
(`formulation.build_model`, section B).

**The reported `fairness_score` is a different quantity**:
`1 - (max_i s_i - min_i s_i)` (range, `metrics.py`). The solvers minimise
the variance-like pairwise term, not the range. The two are monotonically
related on this instance's feasible set (0 of 2,080 pairs ranked
oppositely) but are not equivalent in general. Never present the QUBO
energy as "fairness".

## 3. Inequality constraints and slack encoding

Supply `sum_i x[i,t] <= S_t` and storage `sum_t x[i,t] <= C_i` are
inequalities. For a constraint `sum_v x_v <= B` the code adds `B` binary
slack bits `s_1..s_B` (unary) and the penalty

```
P * ( sum_v x_v + sum_m s_m - B )^2
```

Why this is correct: let `a = sum_v x_v` and `sigma = sum_m s_m in {0..B}`.
Minimising over the slack bits, if `a <= B` pick `sigma = B - a`
(reachable) giving 0; if `a > B` the best is `sigma = 0`, giving
`(a - B)^2`. So `min_s penalty = P * max(0, a - B)^2`, which is what
`formulation.evaluate_objective` computes. A constraint whose maximum
possible `a` is already `<= B` gets no slack bits and no penalty term.
`B = 0` gets no slack bits (penalty `P a^2`).

Default scenario: morning supply (4 variables, bound 2) and evening supply
(3 variables, bound 2) take 2 slack bits each; Riverside storage
(2 variables, bound 1) takes 1. The register is `7 + 5 = 12` qubits. The
unary slack code is redundant (several slack settings give the same sum);
this is harmless for correctness and inflates the Hilbert space slightly.

Demand limits need no penalty: `x <= 1 = d` holds by construction.

Verified by exhaustive enumeration in `benchmark.py` (audit): for all 128
decision patterns, the minimum QUBO energy over the 32 slack settings equals
the independently computed objective (max deviation 0).

## 4. QUBO to Ising

Writing the QUBO as `C(z) = c0 + sum_k c_k z_k + sum_{k<l} Q_kl z_k z_l`
and substituting `z_k = (1 - Z_k)/2`:

```
H_C = c0' I + sum_k h_k Z_k + sum_{k<l} J_kl Z_k Z_l
c0' = c0 + (1/2) sum c_k + (1/4) sum Q_kl
h_k = -(1/2) c_k - (1/4) sum_{l != k} Q_kl
J_kl = (1/4) Q_kl
```

`H_C` is diagonal with `<z|H_C|z> = C(z)`. Verified for all 4,096 basis
states (max deviation 0). Spectrum: ground energy 6.0 (the optimum), mean
over all 4,096 states 83.75, maximum 435; largest `|h_k| = 22`,
largest `|J_kl| = 8.25`. `H_C` is **not normalised**.

## 5. QAOA circuit

For `p` layers with parameters `(gamma_l, beta_l)`:

```
|psi> = prod_{l=1..p} [ exp(-i beta_l sum_k X_k) exp(-i gamma_l H_C) ] |+>^n
```

* Initial state: Hadamard on every qubit (uniform superposition over all
  4,096 decision-plus-slack states, feasible or not).
* Cost layer: `RZZ(2 gamma J_kl)` on every coupled pair, `RZ(2 gamma h_k)`
  on every qubit (the identity term is a global phase). `exp(-i gamma H_C)`
  is exact because all terms commute.
* Mixer: `RX(2 beta)` on every qubit (standard X mixer, **not**
  constraint-preserving).
* Circuit depth reported by the engine: 17 / 29 / 41 for `p = 1 / 2 / 3`.

The circuit is hand-built (not `QAOAAnsatz`). `benchmark.py` re-simulates
the same state with plain NumPy (diagonal phase `exp(-i gamma E_z)`, then a
product of single-qubit X rotations) and matches the engine circuit's
probabilities to < 1e-16 (audit check
`independent_qaoa_simulation_matches_engine_circuit`).

## 6. Parameter optimisation

`<H_C>` is evaluated exactly by statevector (no shot noise). Procedure:

1. Grid warm start: 36 evaluations at `gamma_l = g`, `beta_l = b` for
   `g, b` in `linspace(0.2, 1.2, 6)` (all layers share the value); keep the
   best.
2. SciPy COBYLA from that point with `maxiter = 25`.

Telemetry: `optimizer_iterations` is COBYLA's evaluation count
(`nfev`); the 36 grid evaluations are not included. In every recorded run
it equals the cap (25), i.e. the optimiser stopped at its iteration limit,
not at a convergence tolerance. With 2p = 2, 4, 6 parameters, 25 evaluations
is a small budget. The `seed` argument reaches only the shot sampler; the
grid and COBYLA are deterministic, so repeated runs differ only in
sampled bitstrings (`np.random.seed(seed)` in the solver has no effect).

**Scale caveat (measured).** Penalty energies are integer multiples of
`P = 15`, so the phase factor `exp(-i gamma P m^2)` is trivial whenever
`gamma * P / (2 pi)` is an integer, i.e. `gamma = 2 pi / 15 = 0.419`. The
optimised `gamma` values are 0.404 (p=1), 0.404 / 0.412 (p=2) and
0.404 / 0.398 / 0.351 (p=3): within 0.02 of that point for the first
layers. Re-simulating the same angles with all penalty terms removed from
`H_C` changes the final-state feasible probability only from 0.746 to
0.669 (p=1), 0.630 to 0.573 (p=2), 0.655 to 0.527 (p=3); at p=3 the optimal
pattern is *more* likely without penalties (0.028 vs 0.020). Hence on this
instance the optimiser largely sits where the constraint layer is
weak, and the improved feasibility yield should not be read as the
constraint penalties steering the state. An un-normalised `H_C` with a
`gamma` search window that spans several aliasing periods is the cause.

## 7. Measurement and decoding

The optimised circuit is measured in the computational basis, 1,024 shots
by default, with Qiskit `StatevectorSampler(seed)`. Qiskit bit strings are
little-endian, so the string is reversed; bits `0..K-1` are the decision
variables and the rest are slack. Each distinct bitstring is decoded into an
allocation and evaluated by `metrics.evaluate_allocation` (feasibility) and
`formulation.evaluate_objective` (objective).

Selection: feasible candidates with consistent slack (QUBO energy equals the
objective) are preferred; the one with the lowest objective is returned.
**This is classical post-selection over the sampled set** (about 600
distinct bitstrings per run), not the most frequent outcome. The most
frequent ("modal") bitstring is stored in metadata and is infeasible in
some runs (1 of 5 for p=1 and p=2 in the committed results). `benchmark.py`
decodes and reports it separately (`derived_modal_*`).

## 8. Feasibility validation

Feasibility comes from `metrics.evaluate_allocation` (demand, supply,
storage, entry validity), not from the QUBO energy. The benchmark
additionally recomputes objective and feasibility of every returned
allocation with an independent implementation and exits non-zero on any
disagreement.

## 9. Classical baselines

* **Exact**: enumerates all `2^K = 128` decision patterns, evaluates the
  same objective, returns the best feasible (ties broken by
  `fairness_score`). It is an optimum for *this* objective only. Three
  allocations tie at 6.0.
* **Greedy (priority-first)**: serves neighborhoods in descending
  `priority_weight` slot by slot until supply or storage is exhausted. It
  ignores the disparity term, so it minimises weighted shortage (3.0, better
  than the optimum's 4.5) but scores 11.0 on the shared objective, worse than
  serving nobody (10.0).
* **Uniform random sampling (benchmark control, not an engine solver)**:
  `shots` uniform bitstrings over the same qubit register, same best-feasible
  selection. Added so QAOA is compared with an equal-budget non-quantum
  sampler.

## 10. Experimental settings and what the results do and do not show

Committed run (`benchmark_results/`, `python scripts/benchmark.py`):
`alpha = 2`, `P = 15`, `p in {1,2,3}`, 1,024 shots, `maxiter = 25`,
seeds 0..4, noiseless statevector simulation.

* QAOA best-sampled objective: 6.0 (the optimum) in 14 of 15 runs; one
  p=1 run (seed 4) returned 7.0.
* The shot-matched uniform sampler reaches 6.0 in 15 of 15 runs. With
  `3/128` of patterns optimal, 1,024 uniform shots miss all of them with
  probability about `3e-11`. Best-of-1,024 therefore cannot discriminate
  QAOA from random search on this instance.
* A more informative quantity is the per-shot probability of an optimal
  pattern (independent re-simulation): uniform 0.0234; QAOA 0.0123 (p=1),
  0.0353 (p=2), 0.0201 (p=3). Only p=2 exceeds uniform, by about 1.5x;
  p=1 and p=3 are below it. Fraction of feasible mass: uniform 0.508; QAOA
  0.746, 0.630, 0.655.
* Simulation runtime: exact ~3 ms, QAOA ~0.3 to 0.8 s. This compares an
  enumeration of 128 states with a 4,096-amplitude simulation and is not a
  statement about quantum hardware.

Limitations: one tiny synthetic instance; no noise model; no hardware; no
scaling study (qubit count grows with slack bits); optimiser capped at 25
evaluations; a single objective and fixed `alpha`, `P`; seeds vary only
the sampler. **No quantum advantage is claimed and none could be inferred
from these runs.**
