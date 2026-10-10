# Project specification

## Problem
Allocate limited water across neighborhoods and delivery slots while
balancing unmet demand, service fairness, and supply constraints.

## MVP scope
- Four synthetic neighborhoods and two delivery slots.
- Discrete allocation decisions.
- Per-slot supply limits.
- Neighborhood demand and optional storage limits.
- A fairness metric based on normalized service levels.
- Greedy and exact classical baselines.
- QAOA implemented with current Qiskit circuits/primitives.
- Streamlit interface for scenario controls and comparisons.

## Mathematical contract
Define binary decisions x[i,t] indicating whether neighborhood i
receives one allocation unit during slot t. Only create eligible
decisions where demand exists.

Minimize a documented quadratic objective combining:
1. Weighted unmet demand.
2. Disparity in normalized neighborhood service levels.
3. Penalties for violated supply and storage constraints.

Any inequality converted to a QUBO must have a correct slack-variable
encoding or another explicitly justified encoding. Document the
penalty weights and test that invalid allocations are penalized.

Keep the QAOA demonstration small enough to simulate and compare
against exact enumeration. If the full model is too large, reduce
the instance rather than hiding the computational cost.

## Required evaluation
Report:
- Total demand and allocation.
- Unmet demand and weighted shortage.
- Normalized service fairness.
- Constraint feasibility.
- Objective value and elapsed runtime.
- QAOA sampling/optimization settings.
- Classical baseline results on the same instance.

Do not compare different objectives or constraints as if they were
equivalent. Never claim quantum advantage merely because QAOA runs.

## Product experience
The judge should be able to change supply or demand, run the solvers,
inspect allocations by neighborhood and slot, and understand trade-offs.

## Data integrity
Default scenarios are synthetic and must be labeled as such.
Do not imply that the demo uses live Bengaluru water-network data.
