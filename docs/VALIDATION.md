# Validation findings

Independent review of the objective and metrics. All scenario data is
synthetic. These are findings for coordination; the core spec is unchanged.

## Metric definitions (implemented in `metrics.py`)
- `service_level` = sum of min(alloc, demand) / total demand.
- `fairness_score` = 1 - (max - min) of per-neighborhood service levels,
  over neighborhoods with demand. Range [0, 1], **higher is better**.
- `weighted_shortage` = sum of priority_weight x unmet units. Lower is better.
- Storage limit is interpreted as: total units across slots for one
  neighborhood <= `storage_capacity_units`. INTERFACES.md does not define
  this; the optimization engineer must use the same reading.

## Findings
1. **Fairness rewards doing nothing.** Allocating zero units scores
   fairness 1.0. Fairness must never be reported alone; show it with
   service level. Any objective that rewards low disparity can be
   "improved" by withholding water.
2. **Priority weights conflict with equal-service fairness.** Weighted
   shortage deliberately favors high-weight neighborhoods, while the
   fairness score treats all neighborhoods equally. The two terms pull
   in opposite directions. Weights (1.0 to 2.0) are arbitrary synthetic
   values with no empirical basis.
3. **Metric/objective mismatch risk resolved.** Max-min range is non-quadratic.
   The QUBO optimizes pairwise squared disparity, while `fairness_score`
   measures service range. The engine now exposes both `fairness_score` and
   `disparity` in metrics and documentation to prevent conflation.
4. **Greedy baseline resolution.** Pure priority-first allocation produced
   an objective of 11.0, worse than allocating nothing (10.0). The greedy
   solver was upgraded to an objective-aware heuristic with 1-opt local search,
   reliably achieving objective 7.0 and guarding against dominated allocations.
5. **Random control & benchmark audit.** With 128 states and 1024 shots,
   a shot-matched uniform random control finds the optimal state in 15 of 15 runs.
   Best-of-1024 post-selection cannot separate QAOA from random search.
   Modal bitstrings are occasionally infeasible; reported allocations use
   classical post-selection of the best feasible candidate.
   See `docs/BENCHMARK_FINDINGS.md` for comprehensive tables.
6. **Binary decisions cap demand at one unit per slot.** With x[i,t] in
   {0,1}, demand above 1 per slot is unservable. The default scenario
   uses demand in {0,1} to stay consistent.
7. **Storage rarely binds.** With capacity 2 and two slots of binary
   decisions, storage never binds. The default scenario sets Riverside
   to capacity 1 so the constraint is exercised.
8. **Objective ties are common** in a 4x2 instance; greedy and exact may
   legitimately match. A tie is not evidence for or against QAOA.
9. **Seed controls shot sampling.** In QAOA, seed controls StatevectorSampler
   shot draws; parameter optimization grid is deterministic.

