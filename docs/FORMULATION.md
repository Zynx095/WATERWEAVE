# WATERWEAVE Mathematical Formulation & Optimization Model

This document specifies the binary quadratic optimization model, constraint encodings, Ising mapping, and QAOA workflow implemented in `waterweave.formulation` and `waterweave.solvers`.

---

## 1. Problem Definition & Units

Let:
- $\mathcal{N} = \{1, \dots, N\}$ be the set of neighborhoods.
- $\mathcal{T} = \{1, \dots, T\}$ be the set of delivery slots (e.g., morning, evening).
- $d_{i,t} \in \mathbb{N}_0$ be the demand of neighborhood $i$ during slot $t$ in discrete integer units (e.g., tanker loads or megaliters).
- $D_i = \sum_{t \in \mathcal{T}} d_{i,t}$ be the total demand of neighborhood $i$.
- $w_i > 0$ be the dimensionless priority weight assigned to neighborhood $i$.
- $C_i \in \mathbb{N}_0$ be the local storage capacity of neighborhood $i$ (in units).
- $S_t \in \mathbb{N}_0$ be the total available supply in slot $t$ (in units).

All allocations and capacities are measured in integer allocation units. In the default demonstration scenario:
- Total demand: $7$ units across 4 neighborhoods and 2 slots.
- Total supply: $4$ units ($2$ morning, $2$ evening).
- Scarcity is strictly positive: total demand exceeds total supply ($7 > 4$), forcing trade-offs.

---

## 2. Decision Variables

Per `docs/PROJECT_SPEC.md`, we define discrete binary decision variables:
$$x_{i,t} \in \{0, 1\}$$
indicating whether neighborhood $i$ receives 1 unit of water in slot $t$.

To minimize the qubit count and problem dimensionality:
$$\mathcal{V} = \{ (i, t) \in \mathcal{N} \times \mathcal{T} \mid d_{i,t} \ge 1 \}$$
Variables $x_{i,t}$ are **only created** for pairs where demand exists ($d_{i,t} \ge 1$). If $d_{i,t} = 0$, $x_{i,t} = 0$ identically and no qubit is allocated.

For the default 4-neighborhood, 2-slot scenario:
- $N_1$ (Hillview): $(N_1, \text{morning}), (N_1, \text{evening}) \implies 2$ variables
- $N_2$ (Riverside): $(N_2, \text{morning}), (N_2, \text{evening}) \implies 2$ variables
- $N_3$ (Market): $(N_3, \text{morning}) \implies 1$ variable (evening demand is 0)
- $N_4$ (Lakeside): $(N_4, \text{morning}), (N_4, \text{evening}) \implies 2$ variables
**Total primary decision variables**: $K = 7$.

---

## 3. Objective Function

The optimization objective minimizes three balanced components:
$$\min_{x} F(x) = \text{Weighted Shortage}(x) + \alpha \cdot \text{Disparity}(x) + \text{Penalties}(x)$$

### 3.1 Weighted Shortage
Total units allocated to neighborhood $i$ is $y_i = \sum_{t: (i,t) \in \mathcal{V}} x_{i,t}$.
Since $x_{i,t} \le d_{i,t} = 1$, the served water is $y_i$ and unmet demand is $u_i = D_i - y_i$.

$$\text{Weighted Shortage}(x) = \sum_{i \in \mathcal{N}} w_i u_i = \sum_{i \in \mathcal{N}} w_i D_i - \sum_{(i,t) \in \mathcal{V}} w_i x_{i,t}$$
- **Linear in $x$**: contributes constant $\sum w_i D_i$ and linear term $-w_i$ on each variable $x_{i,t}$.

### 3.2 Fairness & Service-Level Disparity
The normalized service level of neighborhood $i$ (with $D_i > 0$) is:
$$s_i = \frac{y_i}{D_i} = \frac{1}{D_i} \sum_{t: (i,t) \in \mathcal{V}} x_{i,t} \in [0, 1]$$

While the dashboard and evaluation metric reports `fairness_score = 1 - (max(s) - min(s))` (which is range-based and non-quadratic), the mathematical optimization model minimizes the pairwise squared disparity:
$$\text{Disparity}(x) = \sum_{\substack{i < j \\ D_i > 0, D_j > 0}} (s_i - s_j)^2$$

> [!IMPORTANT]
> **Distinction between Disparity and Fairness Score**:
> - `Disparity(x)`: Pairwise squared difference across service levels ($\in [0, \infty)$). Lower is better. This exact quadratic polynomial is minimized by QUBO and Ising Hamiltonians.
> - `fairness_score`: Range-based metric $1 - (\max_i s_i - \min_i s_i) \in [0, 1]$. Higher is better.
> - Because one is based on pairwise squared dispersion and the other on extreme range, they can rank allocations differently on asymmetric instances (e.g., service levels $(0.0, 0.5, 1.0, 0.5)$ has range $1.0$ and disparity $2.0$, whereas $(0.0, 0.9, 0.9, 0.9)$ has range $0.9$ and disparity $2.43$). The QUBO energy must never be equated to or reported as the range-based `fairness_score`. Both metrics are reported separately in `SolverResult.metrics`.

**Quadratic Expansion**:
$$(s_i - s_j)^2 = s_i^2 - 2 s_i s_j + s_j^2$$
Since $x_k \in \{0, 1\}$, $x_k^2 = x_k$. For a neighborhood with $M$ active neighborhoods:
$$s_i^2 = \frac{1}{D_i^2} \sum_{k: i_k = i} x_k + \frac{2}{D_i^2} \sum_{\substack{k < l \\ i_k = i, i_l = i}} x_k x_l$$
$$s_i s_j = \frac{1}{D_i D_j} \sum_{\substack{k: i_k = i \\ l: i_l = j}} x_k x_l$$

Thus, Disparity is an **exact quadratic polynomial** in binary variables $x$:
- Linear coefficient on $x_k$: $\alpha \cdot \frac{M_{\text{act}} - 1}{D_{i_k}^2}$
- Quadratic coefficient on $x_k x_l$ (same neighborhood): $2 \alpha \cdot \frac{M_{\text{act}} - 1}{D_{i_k}^2}$
- Quadratic coefficient on $x_k x_l$ (different neighborhoods): $-2 \alpha \cdot \frac{1}{D_{i_k} D_{i_l}}$

When service levels are identical ($s_i = s_j$), $\text{Disparity} = 0$. When allocations are heavily unequal, Disparity increases quadratically.

---

## 4. Inequality Constraints & Slack Variable Encoding

### 4.1 Supply Limits (Per Slot)
$$\sum_{i: (i,t) \in \mathcal{V}} x_{i,t} \le S_t \quad \forall t \in \mathcal{T}$$

### 4.2 Storage Capacities (Per Neighborhood)
$$\sum_{t: (i,t) \in \mathcal{V}} x_{i,t} \le C_i \quad \forall i \in \mathcal{N}$$

### 4.3 Slack-Variable QUBO Encoding
In QUBO / Ising formulations, inequalities $\sum_v x_v \le B$ cannot use step-functions directly. We introduce binary slack variables $s \in \{0, 1\}$ to convert the inequality into an exact equality:
$$\sum_{v} x_v + \sum_{m=1}^{B} s_m = B$$
Then, each constraint is penalized independently by its squared violation:
$$P \cdot \left( \sum_v x_v + \sum_m s_m - B \right)^2$$

In the theoretical evaluation, the penalties are similarly summed across individual squared violations:
$$\text{Penalties}(x) = P \cdot \left[ \sum_{t \in \mathcal{T}} (\text{supply\_viol}_t)^2 + \sum_{i \in \mathcal{N}} (\text{storage\_viol}_i)^2 + \sum_{i, t} (\text{demand\_viol}_{i, t})^2 \right]$$
This guarantees exact algebraic consistency between the minimum QUBO slack energy and the evaluated objective across both feasible and infeasible configurations.

**Expansion**:
$$\left( \sum_u c_u z_u - B \right)^2 = B^2 + \sum_u (c_u^2 - 2 B c_u) z_u + 2 \sum_{u < v} c_u c_v z_u z_v$$

**Optimization (Active Slacks Only)**:
If the number of active variables in a constraint is already $\le B$, the constraint can never be violated. In that case, **no slack variables are added**, saving precious qubits.

In the default scenario:
- Morning supply: $4$ variables, bound $S_M = 2 \implies 2$ slack qubits ($s_{M,0}, s_{M,1}$)
- Evening supply: $3$ variables, bound $S_E = 2 \implies 2$ slack qubits ($s_{E,0}, s_{E,1}$)
- Riverside ($N_2$) storage: $2$ variables, bound $C_2 = 1 \implies 1$ slack qubit ($s_{N2,0}$)
- Other storage constraints: bounds $C_i = 2 \ge 2$, cannot bind, $0$ slacks.
**Total slack qubits**: $5$.
**Total problem qubits**: $7 + 5 = 12$ qubits.

---

## 5. Penalty Bound Derivation

To guarantee that no infeasible allocation can ever beat a feasible allocation in energy:
1. Every feasible allocation has objective bounded above by the empty (unserved) allocation:
   $$F(x_{\text{feasible}}) \le F(\text{empty}) = \sum_{i \in \mathcal{N}} w_i D_i$$
2. Every infeasible state has at least one constraint violation of magnitude $\ge 1$, which adds penalty $P \cdot 1^2 = P$.
3. Since base unpenalized shortage and disparity are non-negative ($F_{\text{base}}(x) \ge 0$):
   $$F(x_{\text{infeasible}}) \ge P$$
4. Therefore, setting:
   $$P \ge \max\left(15.0, \sum_{i \in \mathcal{N}} w_i D_i + 1.0, 2.0 \cdot \max_i w_i + \alpha\right)$$
   strictly and universally guarantees that every infeasible state has higher energy than the empty allocation and thus strictly dominates the optimal feasible state across any scenario instance.

For the default synthetic 4x2 scenario ($\sum w_i D_i = 10.0, \max w_i = 2.0, \alpha = 2.0$), $P = 15.0 > 10.0$, strictly guaranteeing:
- Ground state feasible energy: $6.0$
- Lowest infeasible energy: $19.5$ (penalty margin $\Delta E = 13.5$)

---

## 6. Mapping to Ising Problem Hamiltonian

Binary variables $z_k \in \{0, 1\}$ map to Pauli-Z spin operators $Z_k \in \{+1, -1\}$ via:
$$z_k = \frac{I - Z_k}{2}$$
For a QUBO $C(z) = \text{offset} + \sum_k c_k z_k + \sum_{k < l} Q_{k, l} z_k z_l$:
$$H_C = \text{offset}_H \cdot I + \sum_k h_k Z_k + \sum_{k < l} J_{k, l} Z_k Z_l$$
where:
$$\text{offset}_H = \text{offset} + \frac{1}{2} \sum_k c_k + \frac{1}{4} \sum_{k < l} Q_{k, l}$$
$$h_k = -\frac{1}{2} c_k - \frac{1}{4} \sum_{l \ne k} Q_{\min(k,l), \max(k,l)}$$
$$J_{k, l} = \frac{1}{4} Q_{k, l}$$

For any computational basis state $|z\rangle$, the expectation value is mathematically exact:
$$\langle z | H_C | z \rangle = C(z)$$

---

## 7. QAOA Circuit Architecture & Execution

The QAOA ansatz with $p$ layers evolves the initial equal superposition $|+\rangle^{\otimes n}$:
$$|\psi(\boldsymbol{\gamma}, \boldsymbol{\beta})\rangle = \prod_{l=1}^p e^{-i \beta_l \sum_k X_k} e^{-i \gamma_l H_C} |+\rangle^{\otimes n}$$

1. **Cost Layer**: Implemented using explicit two-qubit $R_{ZZ}(2 \gamma_l J_{k, l})$ and single-qubit $R_Z(2 \gamma_l h_k)$ gates.
2. **Mixer Layer**: Implemented using single-qubit $R_X(2 \beta_l)$ gates.
3. **Parameter Optimization**: Variational parameters $(\boldsymbol{\gamma}, \boldsymbol{\beta})$ are optimized with `COBYLA` to minimize $\langle H_C \rangle$.
4. **Sampling & Decoding**: The optimal circuit is measured for $1024$ shots using Qiskit's `StatevectorSampler`.
5. **Validation**: Measured bitstrings are decoded (accounting for Qiskit's little-endian bitstring ordering) and evaluated against all operational constraints.
