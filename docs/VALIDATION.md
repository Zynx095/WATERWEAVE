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
3. **Metric/objective mismatch risk.** Max-min range is non-quadratic.
   A QUBO disparity term (e.g. variance of service levels) will rank
   allocations differently from `fairness_score`. Report both the
   solver objective and the shared metrics, and do not call the QUBO
   value "fairness".
4. **Binary decisions cap demand at one unit per slot.** With x[i,t] in
   {0,1}, demand above 1 per slot is unservable. The default scenario
   uses demand in {0,1} to stay consistent.
5. **Storage rarely binds.** With capacity 2 and two slots of binary
   decisions, storage never binds. The default scenario sets Riverside
   to capacity 1 so the constraint is exercised.
6. **Objective ties are common** in a 4x2 instance; greedy and exact may
   legitimately match. A tie is not evidence for or against QAOA.
7. **Seed has no effect** on the default scenario; it is only recorded.
