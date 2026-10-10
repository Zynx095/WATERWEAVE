# Validation findings

Independent review of the WATERWEAVE objective, metrics and engine. All
scenario data is synthetic. The core specification was not edited; items that
need another owner's action are listed in section 5.

Evidence base: `src/waterweave/{metrics,scenarios}.py` (this branch),
engine files on `codex/optimization` commit `9633518` (formulation,
solvers, optimization), and `scripts/benchmark.py`, which enumerates every
decision pattern and re-derives the objective independently. Each "verified"
below is an executed check, listed in the JSON `audit.checks` of the
committed results; reproduce with the commands in the README.

## 1. Metric definitions (`metrics.py`)

* `service_level` = sum of min(allocation, demand) / total demand.
* `weighted_shortage` = sum of priority_weight x unmet units. Lower is better.
* `fairness_score` = 1 - (max - min) of per-neighborhood service levels over
  neighborhoods with demand. Range [0, 1]. **Higher is better.**
* `feasible` = 1.0 iff no invalid entry and no demand, supply or storage
  violation. Storage: total units over slots for one neighborhood
  <= `storage_capacity_units`.

## 2. Review against the checklist

| Question | Finding | Status |
|---|---|---|
| What does one binary decision represent? | `x[i,t] = 1`: one allocation unit to neighborhood `i` in slot `t`. Units are abstract. A slot demand above 1 cannot be served by one bit, so the default scenario uses demands in {0,1}. | verified |
| Do demand and supply constraints match the model? | Demand: enforced by not creating variables where `d = 0` (and `x <= 1 = d`). Supply: per-slot `sum <= S_t`, slack-encoded. Matches `metrics.py`. | verified (128/128 patterns) |
| How is storage interpreted across slots? | Cumulative: `sum_t x[i,t] <= C_i` for the whole day. Metrics, formulation and solvers agree. It is a simple per-day cap with no tank dynamics, carry-over or consumption; do not describe it as a physical storage model. | verified, simplification |
| Are weighted shortage and service level consistent? | Both are computed from the same served units and agree. They are different incentives: shortage is priority-weighted, service level is not. Greedy has *lower* weighted shortage than the optimum (3.0 vs 4.5) at the same service level (4/7). | verified |
| Can fairness reward serving nobody? | **Yes.** Allocating nothing gives `fairness_score = 1.0`, the maximum. The *objective* also prefers it once `alpha >= 22/3 = 7.33`: for `alpha` in {0, .5, 1, 2, 4} the optimum serves 4 units, for `alpha = 8` it serves 0. | verified |
| Does the QUBO represent the intended objective? | It represents exactly the objective stated in FORMULATION.md (shortage + alpha x pairwise squared disparity + penalties): engine objective equals the independent evaluation on all 128 patterns, the minimum QUBO energy over slack equals it, the Ising diagonal equals the QUBO energy on all 4,096 states. It does **not** minimise `fairness_score` (see 2.1). | verified |
| Are the penalties sufficient and correctly encoded? | Encoding correct (see QUANTUM_METHOD.md section 3). `P = 15` is sufficient *here*: best infeasible objective 19.5 vs optimum 6.0. The justification in FORMULATION.md section 5 is not valid (2.2). | verified empirically, bound wrong |

### 2.1 `fairness_score` is not the optimised fairness term

The solvers minimise `sum_{i<j}(s_i - s_j)^2` (a variance-like sum); the
reported score uses the range. They agree in ranking on this instance
(0 of 2,080 feasible pairs inverted) but not in general. Hand example with
four service levels: A = (0, .5, 1, .5) has range 1 (score 0.0) and
disparity 2.0; B = (0, .9, .9, .9) has range .9 (score 0.1) and disparity
2.43. The score calls B fairer; the optimiser's term calls A fairer.
Ties also differ: (1,0,0,0) and (1,1,0,0) have the same range but
disparity 3 and 4.

Practical consequences: the exact optimum has `fairness_score = 0.5`;
among all non-empty feasible allocations the maximum is also 0.5 (N3 has one
unit of demand, so its level is 0 or 1 while the others can only be 0, .5 or
1). A claim of "fairness 0.67" for this scenario is not reachable.

### 2.2 The penalty-weight derivation is invalid

FORMULATION.md section 5 bounds the disparity gain from one extra unit by
`alpha x 1.0`. The disparity term ranges up to 4.0 on this instance (8.0
in objective units at `alpha = 2`). `P = 15` passes only by margin. A
rigorous sufficient condition: every infeasible state has base objective
`>= 0` and at least one violation costing `>= P`, and serving nobody is
feasible with objective `sum_i w_i D_i`, so **`P > sum_i w_i D_i` (= 10 here)
always suffices**. The engine's `max(15, 2 max w + alpha)` does not scale
with the instance and could be insufficient for a larger scenario. Recommend
`P = sum_i w_i D_i + 1`, or keep 15 and document it as an empirically
checked constant for this scenario.

## 3. Incentives and arbitrary choices

1. **Fairness rewards doing nothing.** Always show `fairness_score` next to
   `service_level`; never rank solvers by fairness alone. A solver that
   delivers no water scores 1.0.
2. **`alpha` decides the answer.** `alpha` of 0 or 0.5 selects an allocation
   with score 0.0 (service 4/7); `1 <= alpha <= 4` selects the 0.5
   allocation; `alpha >= 7.33` selects "serve nobody". `alpha = 2.0` and the
   priority weights {1.0, 1.5, 2.0} are arbitrary synthetic values with no
   empirical basis; the optimum should be presented as conditional on them.
3. **Weights and disparity pull in opposite directions.** Shortage is
   priority-weighted; disparity treats all neighborhoods equally. The
   engine's greedy, which serves by priority, scores 11.0 on the shared
   objective, worse than serving nobody (10.0), because it was never
   designed for the disparity term. Present greedy as "optimises weighted
   shortage only", not as a straw man for the full objective.
4. **Ties.** Three allocations reach the optimum 6.0. Differing allocations
   between solvers can therefore both be optimal. Compare objective values,
   not allocation equality.
5. **Seeds.** The engine's seed controls only shot sampling. Variability
   across seeds understates optimiser-start variability.
6. **No cross-objective comparisons.** The dashboard's demo fallback uses
   `weighted_shortage + 10 x (1 - fairness_score)`, a different objective
   from the engine's. These numbers must never be shown beside engine
   objectives as if equivalent.

## 4. QAOA benchmark observations

(From `benchmark_results/benchmark_default.json`; details and caveats in
QUANTUM_METHOD.md section 10.)

* QAOA's best-sampled objective is optimal in 14/15 runs; a shot-matched
  uniform random sampler is optimal in 15/15. Best-of-1,024 sampling cannot
  separate QAOA from random search on 128 decision patterns.
* Per-shot probability of an optimal pattern: uniform 0.0234; QAOA p=1
  0.0123, p=2 0.0353, p=3 0.0201. No consistent improvement with depth.
* The final state's feasible-pattern probability is 0.63 to 0.75 against
  0.51 uniform, but re-simulating the same angles with the penalties removed
  gives 0.53 to 0.67: the constraint layer is not demonstrably responsible
  (the optimised `gamma` sits near `2 pi / P`, where penalty phases are
  nearly invisible).
* The modal measured bitstring is infeasible in 2 of 10 recorded p=1/p=2
  runs. The reported allocation is the best of ~600 sampled bitstrings,
  classically post-selected.
* COBYLA stops at its 25-evaluation cap in every run.
* No quantum advantage is claimed; none is supported.

## 5. Integration issues for other owners

| Owner | Issue |
|---|---|
| Engine (`codex/optimization`) | `run_comparison` keyword arguments `p`, `shots`, `seed`, `maxiter`, `fairness_weight`, `penalty_weight` and the QAOA metadata keys are not in INTERFACES.md. The benchmark reads them defensively and records missing keys in `qaoa_missing_metadata`. Please document or confirm them. |
| Engine | Replace the penalty bound (2.2); normalise `H_C` or window `gamma` per the aliasing finding; consider reporting whether COBYLA converged or hit `maxiter`. |
| Engine | Latest commit `9633518` is not on `origin/codex/optimization` (origin is at `f7355db`). |
| Models owner | `Allocation` is listed in INTERFACES.md but not defined in `models.py`. |
| Dashboard (`antigravity/dashboard`) | `components.py` hard-codes "Fairness to 0.67" and "every neighborhood receives 1 unit" for the exact solution; the engine's exact result has `fairness_score` 0.50. Runtimes ("3.4 ms", "~360 ms") are also hard-coded text. Use `result.metrics` instead. |
| Dashboard | Demo-fallback objective is not the engine objective (section 3, item 6). It is flagged `is_demo`; keep it visually separate from live results. |
| Everyone | `pyproject.toml` and docs start with a UTF-8 BOM; `pytest` fails to parse the root `pyproject.toml` with it on this machine ("Invalid statement at line 1, column 1"). |

## 6. Scope and limits of this validation

One synthetic instance. The checks establish that the engine's code
computes the objective that its documentation states, on this instance and
the reduced `small` instance. They do not establish that the objective is a
good model of water allocation, that `alpha` or the weights are appropriate,
or anything about real networks.
