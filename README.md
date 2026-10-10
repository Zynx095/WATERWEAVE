# WATERWEAVE

**Fair and resilient municipal water allocation using Qiskit quantum optimization.**

WATERWEAVE is a Qiskit Fall Fest Track 2 hackathon project comparing a Quantum Approximate Optimization Algorithm (QAOA) workflow against greedy and exact classical baselines on transparent, constrained water-allocation scenarios.

> **Important Notice on Data and Hardware:**
> - All demonstration and benchmark data is **strictly synthetic**. It does not represent live municipal water distribution networks and should not be used as an operational water controller.
> - QAOA execution is simulated classically using Qiskit's `StatevectorSampler`. **No quantum advantage is claimed or inferred.** Exact classical enumeration solves these small instances in milliseconds, while NISQ circuit simulation carries higher classical simulation overhead.

---

## Quick Start

### 1. Environment Setup
```bash
python -m venv .venv
# Linux/macOS:
source .venv/bin/activate
# Windows:
.venv\Scripts\activate

pip install -e ".[dev]"
```

### 2. Run Test Suite
Run the full test suite (unit tests, validation checks, UI adapter, and headless Streamlit execution):
```bash
pytest
```

### 3. Run Optimization CLI
Run the integrated solver orchestrator directly from the terminal:
```bash
python -m waterweave.optimization
```
This executes the Greedy baseline, Exact classical baseline, and QAOA quantum heuristic on the default synthetic scenario and prints allocation tables, runtimes, objective values, fairness scores, and disparity metrics.

### 4. Run Reproducible Benchmarks
Execute the automated benchmark runner and independent audit suite:
```bash
# Default synthetic 4x2 scenario (7 decision bits, 12 qubits with slacks)
python scripts/benchmark.py

# Small synthetic 3x2 scenario (5 decision bits, 8 qubits with slacks)
python scripts/benchmark.py --instance small
```
Benchmark outputs are written to `benchmark_results/` in CSV and JSON formats, recording hardware metadata, engine git commit provenance, independent audit results, and random-control baselines.

### 5. Launch Interactive Dashboard
Launch the Streamlit decision-support dashboard:
```bash
streamlit run app.py
```
The dashboard provides:
* **Multi-Solver Comparison:** Side-by-side KPI cards, objective analysis, and runtime comparisons.
* **Neighborhood Allocation Schedules:** Detailed delivery matrices, reservoir capacity utilization, and interactive heatmaps.
* **Scenario Studio:** Customizable neighborhood demands, priority weights, reservoir supply, and cistern storage capacities.
* **Quantum Inspector:** Verified circuit telemetry, gate breakdowns ($R_{ZZ}$, $R_Z$, $R_X$, $H$), optimal variational parameters ($\vec{\gamma}, \vec{\beta}$), and ASCII circuit diagrams.
* **System Diagnostics:** Live engine import verification, dependency status, and error tracing.

---

## Mathematical & Quantum Methodology

Solvers are evaluated against a shared quadratic objective:
$$\min_{x} F(x) = \text{Weighted Shortage}(x) + \alpha \cdot \text{Disparity}(x) + P \cdot \text{Violations}(x)$$

* **Binary Variables:** $x_{i,t} \in \{0, 1\}$ represents delivering 1 unit of water to neighborhood $i$ in slot $t$. Variables are created only where demand exists ($d_{i,t} \ge 1$).
* **Constraint Slack Encoding:** Inequality constraints for reservoir supply ($\sum_i x_{i,t} \le S_t$) and cistern storage ($\sum_t x_{i,t} \le C_i$) are converted to exact quadratic penalties using unary binary slack bits: $P(\sum x + \sum s - B)^2$.
* **Fairness Score vs. Disparity:** The reported `fairness_score` ($1 - (\max s - \min s) \in [0, 1]$, higher is better) measures range-based equality, while the QUBO minimizes pairwise squared disparity ($\sum_{i<j}(s_i - s_j)^2$, lower is better). Both metrics are exposed and distinguished to prevent conflation.
* **QAOA Variational Loop:** Handcrafted ansatz with $p$ alternating layers of cost evolution ($e^{-i\gamma H_C}$) and transverse-field mixer rotations ($e^{-i\beta H_M}$), optimized classically via COBYLA with a deterministic grid warm start.
* **Measurement & Decoding:** Computational Z-basis measurement with classical post-selection of the best feasible candidate among sampled bitstrings.

---

## Documentation Index

| Document | Description |
|---|---|
| [`docs/FORMULATION.md`](docs/FORMULATION.md) | Full mathematical specification, binary variables, QUBO matrices, Ising mapping, and penalty bound derivations. |
| [`docs/QUANTUM_METHOD.md`](docs/QUANTUM_METHOD.md) | Deep dive into QAOA ansatz construction, gate decompositions, parameter optimization, measurement decoding, and aliasing caveats. |
| [`docs/VALIDATION.md`](docs/VALIDATION.md) | Independent mathematical audit, formulation checklist review, fairness score vs. disparity ranking proofs, and resolution tracking. |
| [`docs/BENCHMARK_FINDINGS.md`](docs/BENCHMARK_FINDINGS.md) | Empirical benchmark results, objective-aware greedy resolution, random-control comparison, and statevector probability mass analysis. |
| [`docs/INTERFACES.md`](docs/INTERFACES.md) | Shared contracts, Python models (`Scenario`, `Neighborhood`, `SolverResult`, `Allocation`), solver entry point signature, and telemetry keys. |
| [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md) | Original hackathon requirements, track specifications, and architectural guidelines. |

---

## Attribution & References

* **Hackathon Reference Guide:** The problem formulation (binary decisions, quadratic constraint penalties, Ising mapping, QAOA simulation, comparison with exact baselines, and feasibility yield metrics) follows the Track 2 educational reference guide in [Qiskit-Fall-Fest-2026-IIITKottayam-Hackathon-Template](https://github.com/Shanwis/Qiskit-Fall-Fest-2026-IIITKottayam-Hackathon-Template/tree/main/references/track-2-optimization) (MIT License).
* **Quantum Algorithm:** E. Farhi, J. Goldstone, S. Gutmann, *A Quantum Approximate Optimization Algorithm*, 2014, [arXiv:1411.4028](https://arxiv.org/abs/1411.4028).
* **Software Libraries:** [Qiskit](https://github.com/Qiskit/qiskit) (Apache 2.0), [NumPy](https://numpy.org/) (BSD), [SciPy](https://scipy.org/) (BSD), [Streamlit](https://streamlit.io/) (Apache 2.0), [Plotly](https://plotly.com/) (MIT).
