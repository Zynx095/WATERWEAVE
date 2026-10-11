# Validation findings and methodology

Independent review of the WATERWEAVE objective, metrics, formulation, and solver engine.
All scenario data is synthetic. The core specification is preserved, and all integration issues
identified during audit have been addressed.

Evidence base: `src/waterweave/{metrics,scenarios,formulation,solvers,optimization}.py`,
independent formulation checks, and `scripts/benchmark.py`, which enumerates all decision
patterns and verifies objective-energy equivalence.

---

## Executive summary

1. **Fairness rewards doing nothing:** Allocating zero units scores `fairness_score = 1.0` (maximum equality).
   Fairness must always be reported alongside `service_level`. Any objective that rewards low disparity alone
   can be "improved" by withholding water.
2. **Priority weights conflict with equal-service fairness:** Weighted shortage deliberately favors
   high-weight neighborhoods, whereas fairness treats all neighborhoods equally. The two terms pull in
   opposite directions. Priority weights (1.0 to 2.0) are synthetic values with no empirical basis.
3. **Metric vs. objective distinction resolved:** The range-based `fairness_score` in $[0, 1]$ (higher is better)
   and the pairwise squared `disparity` $\sum_{i<j}(s_i - s_j)^2$ (lower is better, minimized by the QUBO)
   can invert rankings in general instances. Both metrics are explicitly exposed and reported to avoid conflation.
4. **Greedy baseline resolution:** Pure priority-first allocation produced an objective of 11.0, worse than
   serving nobody (10.0), because it was oblivious to the disparity penalty. The greedy baseline was upgraded
   to an objective-aware heuristic with 1-opt local search, reliably achieving objective 7.0 and guarding
   against dominated allocations.
5. **Random control and benchmark audit:** On the 128-state synthetic problem, a shot-matched uniform random
   sampler finds the global optimum (objective 6.0) in 15 of 15 runs. Best-of-1024 post-selection cannot
   distinguish QAOA from random search on this instance. The reported allocation uses classical post-selection
   of the best feasible candidate.
6. **Binary decisions cap demand:** With $x_{i,t} \in \{0, 1\}$, demand above 1 unit per slot is unservable
   by a single bit. The synthetic scenarios use demands in $\{0, 1\}$.
7. **Storage constraints:** Cumulative daily cap $\sum_t x_{i,t} \le C_i$ is enforced and validated. In the
   default scenario, Riverside capacity is set to 1 so storage is exercised.
8. **Objective ties are common:** In a 4x2 instance, multiple feasible allocations tie at objective 6.0.
   Solvers are compared by evaluated objective value and feasibility, not allocation bit equality.
9. **Simulator execution:** QAOA is executed on a classical `StatevectorSampler` simulator without noise.
   Random seeds control shot sampling. No physical quantum hardware execution or quantum advantage is claimed.

---

## 1. Metric definitions (`metrics.py`)

* `service_level` = $\frac{\sum_i \min(\text{served}_i, \text{demand}_i)}{\sum_i \text{demand}_i} \in [0, 1]$. Higher is better.
* `weighted_shortage` = $\sum_i w_i \cdot (\text{demand}_i - \text{served}_i)$. Lower is better.
* `fairness_score` = $1 - (\max_i s_i - \min_i s_i)$ over neighborhoods with demand $> 0$. Range $[0, 1]$. Higher is better. Measures range-based equality only.
* `disparity` = $\sum_{i < j} (s_i - s_j)^2$, pairwise squared service level differences. Lower is better. This exact polynomial is minimized by the QUBO/Ising Hamiltonian.
* `feasible` = 1.0 iff there are no invalid entries, no demand violations, no per-slot supply violations, and no neighborhood storage violations.

---

## 2. Review against the checklist

| Question | Finding | Status |
|---|---|---|
| What does one binary decision represent? | $x_{i,t} = 1$: one allocation unit to neighborhood $i$ in slot $t$. Units are abstract. A slot demand above 1 cannot be served by one bit, so the default scenario uses demands in $\{0, 1\}$. | Verified |
| Do demand and supply constraints match the model? | Demand: enforced by not creating variables where $d = 0$ (and $x \le 1 = d$). Supply: per-slot $\sum_i x_{i,t} \le S_t$, slack-encoded. Matches `metrics.py`. | Verified (128/128 patterns) |
| How is storage interpreted across slots? | Cumulative: $\sum_t x_{i,t} \le C_i$ for the whole day. Metrics, formulation, and solvers agree. It is a simple per-day cap with no tank dynamics, carry-over, or consumption; not a physical hydraulic model. | Verified (simplification) |
| Are weighted shortage and service level consistent? | Both are computed from the same served units and agree. They represent different incentives: shortage is priority-weighted, service level is unweighted. | Verified |
| Can fairness reward serving nobody? | **Yes.** Allocating nothing gives `fairness_score = 1.0`, the maximum. The objective also prefers it once $\alpha \ge \frac{22}{3} \approx 7.33$: for $\alpha \in \{0, 0.5, 1, 2, 4\}$ the optimum serves 4 units; for $\alpha = 8$ it serves 0. | Verified |
| Does the QUBO represent the intended objective? | It represents exactly the objective stated in `FORMULATION.md` (shortage + $\alpha \times$ pairwise squared disparity + penalties): engine objective equals independent evaluation on all 128 patterns, minimum QUBO energy over slack equals it, and Ising diagonal equals QUBO energy on all 4,096 states. It does **not** minimize `fairness_score` (see 2.1). | Verified |
| Are the penalties sufficient and correctly encoded? | Encoding correct (see `QUANTUM_METHOD.md` section 3). $P = 15$ is sufficient here: best infeasible objective 19.5 vs optimum 6.0. The analytical bound derivation was corrected in `FORMULATION.md`. | Verified empirically |

### 2.1 `fairness_score` is not the optimised fairness term

The solvers minimize $\sum_{i<j}(s_i - s_j)^2$ (pairwise variance-like sum); the reported `fairness_score` uses the range $1 - (\max s - \min s)$. They agree on ranking for the default instance (0 of 2,080 feasible pairs inverted), but can invert rankings in general.

**Counterexample with 4 neighborhoods (demands 10 units each):**
* Allocation A: service levels $(0.0, 0.5, 1.0, 0.5) \implies$ range $= 1.0$ (`fairness_score = 0.0`), disparity $= 2.0$.
* Allocation B: service levels $(0.0, 0.9, 0.9, 0.9) \implies$ range $= 0.9$ (`fairness_score = 0.1`), disparity $= 2.43$.

Ranking result:
* Range-based `fairness_score`: B is rated fairer than A ($0.1 > 0.0$).
* Quadratic disparity (QUBO): A is rated fairer than B ($2.0 < 2.43$).

Ties also differ: $(1,0,0,0)$ and $(1,1,0,0)$ have the same range (1.0) but disparities 3.0 and 4.0.

**Practical consequences:** On the synthetic default scenario, the exact optimum has `fairness_score = 0.5`; among all non-empty feasible allocations the maximum achievable is also 0.5 (Market N3 has 1 unit of demand, so its level is 0 or 1, while the others are 0, 0.5, or 1). A claim of "fairness 0.67" for this scenario is mathematically impossible. Both `fairness_score` and `disparity` are explicitly presented in metrics, dashboard cards, and telemetry.

### 2.2 Penalty-weight derivation and bounds

A rigorous sufficient condition for penalty weight $P$: every infeasible state has base objective $\ge 0$ and at least one constraint violation costing $\ge P \cdot 1^2 = P$. Because serving nobody is feasible with objective $\sum_i w_i D_i$ ($= 10$ for the default instance), choosing:
$$P > \sum_i w_i D_i$$
guarantees that any infeasible state has objective $\ge P > 10$, strictly worse than a known feasible state.
For the default instance, $P = 15 > 10$ provides comfortable penalty dominance (best infeasible state scores 19.5 vs optimum 6.0, margin 13.5). The engine dynamically computes $P = \max(15.0, \sum_i w_i D_i + \alpha \cdot \text{max\_disparity} + 1.0)$.

---

## 3. Incentives and arbitrary choices

1. **Fairness rewards doing nothing:** Always show `fairness_score` alongside `service_level`; never rank solvers by fairness alone. A solver delivering zero water achieves a perfect 1.0 fairness score.
2. **$\alpha$ controls the trade-off:** $\alpha \in \{0, 0.5\}$ yields an allocation with fairness 0.0 (service 4/7); $1 \le \alpha \le 4$ yields the fairness 0.5 allocation; $\alpha \ge 7.33$ selects "serve nobody". $\alpha = 2.0$ and priority weights $\{1.0, 1.5, 2.0\}$ are synthetic values; the optimum is conditional on these choices.
3. **Weights and disparity pull in opposite directions:** Shortage is priority-weighted; disparity treats all neighborhoods equally. A naive greedy solver serving strictly by priority achieved objective 11.0. Upgrading to an objective-aware 1-opt greedy baseline brought it to 7.0.
4. **Ties:** Three distinct allocations achieve the global minimum objective 6.0. Differing bit patterns between solvers can both be optimal. Solvers are compared by evaluated objective, not bitstring equality.
5. **Seeds:** In QAOA, the seed controls the Qiskit `StatevectorSampler` shot sampling; classical angle optimization (warm grid + COBYLA) is deterministic.
6. **Cross-objective consistency:** The dashboard fallback uses the exact same objective formula ($\text{shortage} + 2.0 \times \text{disparity}$) and is explicitly labeled with `is_demo: True`.

---

## 4. QAOA benchmark observations and random control

From `benchmark_results/benchmark_default.json` (details in `docs/QUANTUM_METHOD.md` and `docs/BENCHMARK_FINDINGS.md`):

* **Global optimum frequency:** QAOA's best-sampled candidate reaches the global optimum (objective 6.0) in 14 of 15 runs across depths $p \in \{1, 2, 3\}$. A shot-matched uniform random sampler reaches 6.0 in 15 of 15 runs. Best-of-1024 sampling cannot distinguish QAOA from random search on 128 decision states.
* **Per-shot optimal state probability:** Uniform random sampling yields 0.0234 ($3/128$). QAOA yields 0.0123 ($p=1$), 0.0353 ($p=2$), and 0.0201 ($p=3$). Only $p=2$ slightly exceeds uniform random sampling (by $\sim 1.5\times$); $p=1$ and $p=3$ are below uniform.
* **Feasible subspace probability:** The final state's feasible-pattern probability is 0.63 to 0.75 (vs 0.51 uniform). However, re-simulating the optimized angles with penalty terms removed yields 0.53 to 0.67: the optimized $\gamma$ sits near $2\pi / P \approx 0.419$, where penalty phases are partially transparent.
* **Modal bitstring vs. returned allocation:** The modal (most frequent) measured bitstring was infeasible in 2 of 10 recorded $p=1/p=2$ runs. The reported allocation is obtained through classical post-selection of the best feasible candidate from the $\sim 600$ sampled unique bitstrings.
* **Optimizer budget:** COBYLA reaches its 25-evaluation budget in every run.
* **Honest quantum advantage statement:** No quantum advantage is claimed, and none is supported by these experiments. QAOA is executed on a classical statevector simulator.

---

## 5. Integration resolution tracking

| Issue Identified in Audit | Responsible Workstream | Resolution Status | Verified in Integration |
|---|---|---|---|
| Document `run_comparison` keyword arguments (`p`, `shots`, `seed`, `maxiter`, `fairness_weight`, `penalty_weight`) and QAOA telemetry keys | `codex/optimization` | **Resolved** in `c068a6f` and `docs/INTERFACES.md` | Full signature & metadata contract verified |
| Strengthen penalty bound derivation in `FORMULATION.md` | `codex/optimization` | **Resolved** in `40fab93` | $P > \sum w_i D_i$ sufficient condition documented |
| Upgrade naive greedy solver to prevent dominated allocations | `codex/optimization` | **Resolved** in `b4e912f` | Objective-aware 1-opt greedy achieves objective 7.0 |
| Eliminate hardcoded values ("Fairness 0.67", "3.4 ms") in dashboard | `antigravity/dashboard` | **Resolved** in `6e3ca24` | Dynamic metric derivation from `SolverResult.metrics` |
| Align UI demo fallback objective with QUBO pairwise disparity formula | `antigravity/dashboard` | **Resolved** in `bbd0495` / `5d00c82` | Uses exact enumeration matching QUBO formula; labeled `is_demo` |
| Expose both `fairness_score` and `disparity` to prevent conflation | Shared contract | **Resolved** in `a020bc7` & `metrics.py` | Both metrics computed, tested, and displayed |
| Remove UTF-8 Byte Order Mark (BOM) from configs and documentation | Shared repository | **Resolved** across all files | Clean UTF-8 files pass pytest and linters |
| Provide Quantum Circuit Inspector for genuine circuit and gate telemetry | `antigravity/dashboard` | **Resolved** in `8e4841d` | Reconstructs genuine circuit from telemetry angles |

---

## 6. Scope and limitations of validation

1. **Synthetic instance scope:** All validations were performed on synthetic instances (`synthetic-4x2` and `small` 3x2). These demonstrate algorithmic mechanics and QUBO slack encoding, not physical municipal water systems.
2. **Simulator execution:** All quantum calculations were performed using Qiskit's `StatevectorSampler`. No physical quantum processing unit (QPU) was utilized.
3. **Heuristic parameter budget:** COBYLA was run with 25 iterations from a 36-point warm grid. Larger evaluation budgets and parameter transfer strategies remain for future investigation.
4. **Attribution:** The binary decision variable encoding, QUBO penalty formulation, and classical post-selection methodology follow Track 2 educational guidelines and Farhi et al. (2014).
