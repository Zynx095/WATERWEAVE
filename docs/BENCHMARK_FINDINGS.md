# Reproducible Benchmark Findings & Solver Evaluation

This document records the empirical benchmark results obtained from executing `scripts/benchmark.py` across the synthetic demonstration scenarios (`default` 4x2 instance and `small` 3x2 instance).

All data is **synthetic**. QAOA execution is simulated classically via Qiskit's `StatevectorSampler`.

---

## 1. Benchmark Results Summary

### Synthetic 4x2 Default Scenario (7 Decision Bits, 12 Qubits with Slacks)
- Settings: $\alpha = 2.0$, $P = 15.0$, $1024$ measurement shots, seeds $\in \{0, 1, 2, 3, 4\}$, COBYLA $\text{maxiter} = 25$.

| Solver | Depth ($p$) | OK / Total | Feasible Rate | Hit Optimum Rate | Objective (Mean $\pm$ SD) | Range | Median Runtime | Feasible Sample Ratio |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Greedy (Objective-Aware)** | — | 15 / 15 | 100% | 0% | $7.000 \pm 0.000$ | $7.00 .. 7.00$ | $0.0009\text{ s}$ | — |
| **Exact Classical (Optimal)** | — | 15 / 15 | 100% | 100% | $6.000 \pm 0.000$ | $6.00 .. 6.00$ | $0.0035\text{ s}$ | — |
| **QAOA (Quantum Heuristic)** | 1 | 5 / 5 | 100% | 80% | $6.200 \pm 0.447$ | $6.00 .. 7.00$ | $0.3279\text{ s}$ | $74.6\%$ |
| **QAOA (Quantum Heuristic)** | 2 | 5 / 5 | 100% | 100% | $6.000 \pm 0.000$ | $6.00 .. 6.00$ | $0.5501\text{ s}$ | $63.0\%$ |
| **QAOA (Quantum Heuristic)** | 3 | 5 / 5 | 100% | 100% | $6.000 \pm 0.000$ | $6.00 .. 6.00$ | $0.7304\text{ s}$ | $65.5\%$ |
| **Uniform Random Control** | — | 15 / 15 | 100% | 100% | $6.000 \pm 0.000$ | $6.00 .. 6.00$ | $0.0003\text{ s}$ | $50.8\%$ |

### Synthetic 3x2 Small Scenario (5 Decision Bits, 8 Qubits with Slacks)
- Settings: $\alpha = 2.0$, $P = 15.0$, $1024$ measurement shots, seeds $\in \{0, 1, 2, 3, 4\}$, COBYLA $\text{maxiter} = 25$.

| Solver | Depth ($p$) | OK / Total | Feasible Rate | Hit Optimum Rate | Objective (Mean $\pm$ SD) | Range | Median Runtime | Feasible Sample Ratio |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Greedy (Objective-Aware)** | — | 15 / 15 | 100% | 100% | $5.000 \pm 0.000$ | $5.00 .. 5.00$ | $0.0004\text{ s}$ | — |
| **Exact Classical (Optimal)** | — | 15 / 15 | 100% | 100% | $5.000 \pm 0.000$ | $5.00 .. 5.00$ | $0.0007\text{ s}$ | — |
| **QAOA (Quantum Heuristic)** | 1 | 5 / 5 | 100% | 100% | $5.000 \pm 0.000$ | $5.00 .. 5.00$ | $0.1195\text{ s}$ | $76.3\%$ |
| **QAOA (Quantum Heuristic)** | 2 | 5 / 5 | 100% | 100% | $5.000 \pm 0.000$ | $5.00 .. 5.00$ | $0.1729\text{ s}$ | $72.2\%$ |
| **QAOA (Quantum Heuristic)** | 3 | 5 / 5 | 100% | 100% | $5.000 \pm 0.000$ | $5.00 .. 5.00$ | $0.2367\text{ s}$ | $63.3\%$ |
| **Uniform Random Control** | — | 15 / 15 | 100% | 100% | $5.000 \pm 0.000$ | $5.00 .. 5.00$ | $0.0002\text{ s}$ | $34.4\%$ |

---

## 2. Key Mathematical & Algorithmic Findings

### A. The Greedy Baseline Regression & Resolution
- **Original Problem**: A pure priority-first greedy heuristic allocated water to the highest priority neighborhoods ($N_4$ with $w=2.0$ and $N_1$ with $w=1.5$), completely ignoring the service disparity penalty. On the default scenario, this yielded a weighted shortage of $3.0$ but a disparity of $4.0$, scoring total objective $3.0 + 2.0(4.0) = 11.0$. This was strictly worse than allocating zero units ($F(\text{empty}) = 10.0$).
- **Resolution**: The improved greedy heuristic is objective-aware. It uses forward greedy selection guided by marginal objective reduction ($\Delta F(x)$), checks candidates against the priority-first and zero-allocation baselines to prevent domination, and executes deterministic 1-opt local refinement.
- **Empirical Result**: The improved greedy solver achieves objective $7.0$ in $0.9\text{ ms}$, strictly outperforming the zero-allocation baseline ($10.0$) while remaining distinct from the exact global optimum ($6.0$).

### B. QAOA vs. Uniform Random Sampling Control
- On the 7-bit primary decision space ($2^7 = 128$ states), exactly $3$ states tie for the global optimum of $6.0$.
- With $1024$ measurement shots, a simple uniform random sampler over the same qubit register draws an optimal state with probability $1 - (1 - 3/128)^{1024} \approx 1 - 3.2 \times 10^{-11}$.
- Consequently, **both QAOA and uniform random sampling hit the optimum in virtually every run**. Best-of-$1024$ post-selection cannot discriminate QAOA from random sampling on this small instance.
- Exact classical enumeration evaluates all 128 candidates deterministically in **$3.5\text{ ms}$**, compared to **$320\text{ ms} - 730\text{ ms}$** for QAOA simulation.

### C. Statevector Probability Mass Analysis
To look beyond best-of-$1024$ sampling, independent statevector re-simulation was used to calculate the actual probability mass assigned by the optimized QAOA wavefunctions:

| Depth | $P(\text{optimal pattern})$ | $P(\text{feasible pattern})$ | Modal Feasible Rate |
|---|:---:|:---:|:---:|
| **Uniform Random Reference** | $0.0234$ | $0.5078$ | — |
| **QAOA $p=1$** | $0.0123$ | $0.7461$ | $80\%$ |
| **QAOA $p=2$** | $0.0353$ | $0.6296$ | $80\%$ |
| **QAOA $p=3$** | $0.0201$ | $0.6553$ | $100\%$ |

- Only depth $p=2$ produces an optimal-state probability mass ($0.0353$) higher than uniform random chance ($0.0234$). Depths $p=1$ and $p=3$ place *less* probability mass on the optimal pattern than uniform sampling.
- While QAOA concentrates probability mass on feasible states ($63\% - 75\%$ feasible vs $50.8\%$ uniform), re-simulating the circuit with penalty terms removed reveals that the classical optimizer settles near parameter aliasing frequencies ($\gamma \approx 2\pi / P$).

### D. Modal Bitstring vs. Classical Post-Selection
- In multiple runs (e.g. seed 0 for $p=1$ and seed 1 for $p=2$), the **modal (most frequent) sampled bitstring is infeasible**.
- The solver's reported allocation is obtained through classical post-selection: filtering sampled bitstrings for feasibility and consistent slack variables, then choosing the candidate with the lowest objective.
- This distinction is explicitly surfaced in telemetry via `modal_bitstring`, `modal_bitstring_feasible`, and `selection_rule`.

---

## 3. Conclusions on Quantum Advantage

1. **No Quantum Advantage**: There is no quantum advantage demonstrated or claimed. Exact classical enumeration solves the instance in $\approx 3.5\text{ ms}$, whereas QAOA requires orders of magnitude more classical simulation time.
2. **Pedagogical Prototype**: WATERWEAVE serves as a transparent educational demonstration of QUBO encoding, slack variable formulation, and Qiskit QAOA execution for constrained resource allocation.
