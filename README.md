# Project Title

# WATERWEAVE: Fair & Resilient Municipal Water Allocation via Qiskit QAOA

## Project Metadata

* **Project Title:** WATERWEAVE — Fair & Resilient Municipal Water Allocation via Quantum Optimization
* **Team Name:** WATERWEAVE Project Team
* **Chosen Track:** Track 2: Open-Domain Optimization & Real-World Solvers
* **Video Presentation Link:** *[Pending Submission Video URL — To be uploaded prior to final deadline]*  
  *(⚠️ Crucial: Ensure link access is set to "Anyone with the link can view" on Google Drive or "Unlisted / Public" on YouTube. Locked/inaccessible links cannot be scored!)*
* **Live Demo Timestamp in Video:** *[Pending — Video timestamp e.g. 02:15 upon recording]*

### Team Members (Max 4 members)
| Name | Email | GitHub Username |
| :--- | :--- | :--- |
| *[Team Lead / Optimization Engineer]* | *[lead-email@example.com]* | *[@team-lead]* |
| *[Quantum Algorithm Engineer]* | *[quantum-dev@example.com]* | *[@quantum-dev]* |
| *[Full-Stack Dashboard Engineer]* | *[ui-dev@example.com]* | *[@ui-dev]* |
| *[Validation & Benchmark Engineer]* | *[validation-dev@example.com]* | *[@validation-dev]* |

*(Note: Team members above are placeholders for the team registration form. Individual workstream branches `codex/optimization`, `antigravity/dashboard`, and `claude/validation` developed the respective subsystems).*

---

## 1. Project Overview & Motivation

* **Summary (3–4 sentences):**  
  WATERWEAVE models urban municipal water rationing during drought scarcity as a constrained binary quadratic optimization problem. When daily municipal demand strictly exceeds reservoir supply across delivery slots, the system balances weighted emergency priority against neighborhood service-level equity. We formulate the problem as a Quadratic Unconstrained Binary Optimization (QUBO) model and solve it using Qiskit's Quantum Approximate Optimization Algorithm (QAOA) alongside exact integer enumeration and objective-aware greedy classical baselines.

* **Why this problem / game?**  
  Water distribution under severe drought is a high-stakes, real-world trilemma involving physical reservoir delivery caps, local cistern storage capacities, and social equity. In traditional priority-first allocation, lower-priority neighborhoods can be completely starved of water, causing severe disparity. Mathematically, modeling pairwise service-level equity introduces quadratic coupling terms $(s_i - s_j)^2$, creating an Ising spin-glass energy landscape. This makes municipal water rationing an ideal, pedagogically transparent problem to demonstrate Qiskit's QAOA workflow, unary slack variable constraint encoding, and classical post-selection mechanics.

---

## 2. Quantum Architecture & Mechanics

* **Core Quantum Principles Used:**  
  * **Superposition ($|+\rangle^{\otimes n}$):** Uniform superposition initialization across all $2^{12} = 4,096$ decision and slack basis states via Hadamard ($H$) gates.
  * **Ising Cost Hamiltonian ($H_C$):** Binary decision variables map to Pauli-$Z$ spin operators via $x_k = \frac{I - Z_k}{2}$. Quadratic pairwise disparity and constraint penalties map to two-qubit $R_{ZZ}(2\gamma J_{kl})$ entangling gates, while linear shortage penalties map to single-qubit $R_Z(2\gamma h_k)$ phase rotations.
  * **Transverse-Field Mixer ($H_M$):** Standard unconstrained transverse-field mixer unitary $e^{-i\beta H_M} = \prod_k R_X(2\beta)$, driving transitions across the Hilbert space.
  * **Variational Optimization Loop:** Classical optimizer (SciPy COBYLA with a deterministic 36-point grid warm-start) tuning $(\vec{\gamma}, \vec{\beta})$ to minimize $\langle H_C \rangle$.
  * **Measurement & Classical Post-Selection:** Computational $Z$-basis measurement ($1,024$ shots) with Qiskit `StatevectorSampler`, followed by classical post-selection to identify the best feasible candidate.

* **How the Quantum Circuit is Integrated:**  
  The Qiskit quantum circuit directly encodes the water-allocation decision variables. Each binary delivery choice $x_{i,t} \in \{0, 1\}$ (neighborhood $i$ in slot $t$ where demand $> 0$) is assigned a primary qubit ($K=7$ decision qubits on the default $4\times 2$ instance). Additional unary slack qubits ($5$ slack qubits) convert reservoir supply inequalities ($\sum x \le S_t$) and cistern storage inequalities ($\sum x \le C_i$) into quadratic penalties $P(\sum x + \sum s - B)^2$. The parameterized circuit is simulated using Qiskit's noiseless `StatevectorSampler`, measuring bitstrings that are decoded into municipal delivery schedules.

* **Circuit Details:**  
  * **Number of Qubits:** 12 qubits ($7$ decision qubits + $5$ slack qubits).
  * **Key Gates Used:** $H$ (12 state preparation gates), $R_{ZZ}$ (15 two-qubit entangling interactions), $R_Z$ (12 single-qubit cost phase rotations), $R_X$ (12 transverse mixer rotations). Total circuit depth = 17 at layer depth $p=1$.
  * **Primitives Used:** Qiskit `StatevectorSampler` (noiseless statevector simulation).
  * **Other Technologies Used:** Streamlit (interactive UI dashboard & Quantum Circuit Inspector), Plotly (interactive heatmaps and schedule charts), Pandas, SciPy, NumPy.

```python
# Representative snippet: Parameterized QAOA circuit construction in WATERWEAVE
from qiskit import QuantumCircuit
from waterweave.formulation import build_model
from waterweave.solvers import _build_qaoa_circuit

model = build_model(scenario, fairness_weight=2.0)
qc = _build_qaoa_circuit(model, gammas=[0.404], betas=[0.392])
print(f"Circuit width: {qc.num_qubits} qubits, Depth: {qc.depth()}, Gate counts: {dict(qc.count_ops())}")
```

---

## 3. Repository Structure & How to Run

### Project Structure
```text
├── README.md               # Project submission documentation (this file)
├── requirements.txt        # Reconciled Python dependencies
├── pyproject.toml          # Packaging and test configuration
├── app.py                  # Streamlit dashboard entry point
├── HACKATHON_GUIDE.md      # Official Qiskit Fall Fest 2026 hackathon guide
├── LICENSE                 # MIT License (Qiskit Fall Fest 2026 template)
├── AGENTS.md               # Multi-agent coordination rules and contracts
├── src/                    # Core WATERWEAVE application package
│   └── waterweave/
│       ├── __init__.py     # Package exports
│       ├── models.py       # Data models: Scenario, Neighborhood, SolverResult, Allocation
│       ├── scenarios.py    # Synthetic municipal scenarios (default 4x2, small 3x2)
│       ├── formulation.py  # QUBO objective, slack variables, and Ising Hamiltonian mapping
│       ├── solvers.py      # Exact integer enumeration, Greedy 1-opt, and Qiskit QAOA engine
│       ├── metrics.py      # Range-based fairness_score, pairwise disparity, feasibility
│       ├── optimization.py # Solver entry point run_comparison() & CLI runner
│       └── ui/             # Streamlit dashboard adapter, components, styles
├── notebooks/              # Executed demonstration notebooks
│   ├── waterweave_demo.ipynb # End-to-end reproducible walkthrough with saved outputs
│   └── solution.ipynb        # Primary submission walkthrough notebook
├── references/             # Track 2 hackathon reference materials
│   └── track-2-optimization/ # Educational reference guide and starter notebook
├── docs/                   # Exhaustive mathematical and architectural documentation
│   ├── FORMULATION.md      # QUBO mathematics, slack encoding, penalty bounds
│   ├── QUANTUM_METHOD.md   # Deep dive into Hamiltonian, gates, aliasing, and sampling
│   ├── VALIDATION.md       # Independent audit, checklist review, ranking proofs
│   ├── BENCHMARK_FINDINGS.md # Empirical benchmark tables and random-control analysis
│   ├── INTERFACES.md       # Shared Python contracts and telemetry schema
│   └── PROJECT_SPEC.md     # Hackathon track specifications and design rules
├── scripts/                # Utility and benchmark automation scripts
│   ├── benchmark.py        # Automated benchmark runner with independent mathematical audit
│   └── generate_notebook.py# Script to generate and execute notebooks with live outputs
├── benchmark_results/      # Reproducible experimental datasets and audit provenance
│   ├── benchmark_default.json / .csv # Updated engine results (4x2 instance)
│   ├── benchmark_small.json / .csv   # Updated engine results (3x2 instance)
│   ├── audit_engine_9633518/         # Archived independent audit benchmark datasets
│   └── README.md                     # Data provenance documentation
└── tests/                  # Complete test suite (97 tests passing)
    ├── test_integration.py # End-to-end multi-solver and UI adapter integration tests
    ├── test_ui_app.py      # Automated headless Streamlit AppTest execution
    ├── test_ui.py          # UI components, Quantum Inspector, and fallback tests
    ├── test_solvers.py     # Greedy, Exact, and QAOA solver tests
    ├── test_formulation.py # QUBO slack encoding and Ising diagonal energy tests
    ├── test_metrics.py     # Fairness score, disparity, and ranking inversion tests
    ├── test_optimization.py# run_comparison() contract and argument validation
    ├── test_scenarios.py   # Synthetic scenario data integrity tests
    └── test_benchmark.py   # Benchmark runner and audit verification tests
```

### Installation & Execution Instructions

> 💡 **Environment Recommendation:** To avoid package conflicts, use a fresh Python virtual environment (Python 3.11 or 3.12):
> ```bash
> python -m venv .venv
> source .venv/bin/activate    # On Windows: .venv\Scripts\activate
> pip install -r requirements.txt
> pip install -e .             # Installs waterweave in editable mode
> ```

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Zynx095/WATERWEAVE.git
   cd WATERWEAVE
   ```
2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   pip install -e .
   ```
3. **Run the test suite:**
   ```bash
   pytest
   ```
   *(Executes all 97 test cases across unit, integration, benchmark, and Streamlit AppTest suites).*

4. **Run the optimization CLI:**
   ```bash
   python -m waterweave.optimization
   ```
   *(Executes Greedy, Exact, and QAOA solvers on the synthetic 4x2 scenario and prints formatted allocations, runtimes, fairness scores, and disparity metrics).*

5. **Launch the interactive Streamlit web dashboard:**
   ```bash
   streamlit run app.py
   ```
   *(Opens the decision-support dashboard in your web browser with interactive scenario sliders, solver comparisons, and the Quantum Circuit Inspector).*

6. **Run the reproducible benchmark runner:**
   ```bash
   # Default 4x2 instance (seeds 0..4, p=1..3)
   python scripts/benchmark.py

   # Small 3x2 instance
   python scripts/benchmark.py --instance small
   ```

7. **Open the Jupyter demonstration notebook:**
   ```bash
   jupyter notebook notebooks/waterweave_demo.ipynb
   ```
   *(Contains pre-computed live outputs walking through formulation, baselines, QAOA circuit, and benchmark tables).*

---

## 4. Live Municipal Data Integration

WATERWEAVE includes a live data-ingestion pipeline designed to map real-world observations into the synthetic combinatorial topology.

* **Verified Sources**:
  * **Open-Meteo**: Provides real-time rainfall data for Bengaluru, which heuristics use to adjust the evening slot reservoir supply.
  * **BBMP Census Data (2011)**: Static estimates used to scale priority weights per neighborhood proportionally based on verified ward counts.
* **Architecture**: A modular `DataProvider` registry (`src/waterweave/data/`) standardizes live/static inputs into a unified `Observation` schema. 
* **Resilience**: The system caches responses with a 5-minute TTL, explicitly flags missing values or API failures, and gracefully falls back to synthetic inputs if external connectivity is lost.
* **Limitations**: There is currently no public real-time API for BWSSB reservoir levels or real-time local demand flow, necessitating heuristic models based on weather and census data.

---

## 5. Implementation Walkthrough & Live Demo

* **Walkthrough of Gameplay / Optimization Pipeline:**  
  1. **Scenario Ingestion:** The municipal scenario specifies 4 neighborhoods and 2 delivery slots. Total demand is 7 units; total supply is 4 units (forcing a 3-unit shortfall).
  2. **Model Compilation:** Ineligible decision variables where demand is zero are pruned, creating 7 binary decision variables. Reservoir supply and cistern storage bounds are converted into equalities using 5 unary slack bits.
  3. **Ising Hamiltonian Formulation:** The QUBO objective is transformed into a 12-qubit diagonal Ising Hamiltonian $H_C$.
  4. **QAOA Execution:** A $p$-layer variational circuit is prepared in superposition. COBYLA tunes variational angles $(\vec{\gamma}, \vec{\beta})$. The circuit is sampled across 1,024 shots with Qiskit's `StatevectorSampler`.
  5. **Decoding & Classical Post-Selection:** Measured bitstrings are mapped back to neighborhood delivery tables. The solver selects the best feasible candidate with consistent slack energy.
  6. **Dashboard & Quantum Inspector:** Streamlit renders comparison tables, supply utilization charts, and the Quantum Inspector displays genuine gate breakdowns and ASCII circuit diagrams.

* **Key Screenshots / Terminal Output:**  
```text
======================================================================
WATERWEAVE Optimization Comparison
Scenario: synthetic-4x2 (4 neighborhoods, 2 delivery slots)
======================================================================

--- Greedy (Priority-First) ---
  Feasible:             True
  Objective Value:      7.0000
  Weighted Shortage:    5.50
  Fairness Score:       0.5000
  Disparity (QUBO):     0.7500
  Service Level:        42.86%
  Allocated / Demand:   3/7 units
  Runtime:              0.0009 s
  Allocation:
    N1: {'morning': 1, 'evening': 0}
    N2: {'morning': 0, 'evening': 1}
    N3: {'morning': 0, 'evening': 0}
    N4: {'morning': 1, 'evening': 0}

--- Exact Classical (Optimal) ---
  Feasible:             True
  Objective Value:      6.0000
  Weighted Shortage:    4.50
  Fairness Score:       0.5000
  Disparity (QUBO):     0.7500
  Service Level:        57.14%
  Allocated / Demand:   4/7 units
  Runtime:              0.0034 s
  Allocation:
    N1: {'morning': 0, 'evening': 1}
    N2: {'morning': 0, 'evening': 1}
    N3: {'morning': 1, 'evening': 0}
    N4: {'morning': 1, 'evening': 0}

--- QAOA (Quantum Heuristic) ---
  Feasible:             True
  Objective Value:      6.0000
  Weighted Shortage:    4.50
  Fairness Score:       0.5000
  Disparity (QUBO):     0.7500
  Service Level:        57.14%
  Allocated / Demand:   4/7 units
  Runtime:              0.3544 s
  Allocation:
    N1: {'morning': 0, 'evening': 1}
    N2: {'morning': 1, 'evening': 0}
    N3: {'morning': 1, 'evening': 0}
    N4: {'morning': 0, 'evening': 1}
  QAOA Circuit:         depth=17, qubits=12, shots=1024
  Feasible Samples:     74.41%

======================================================================
```

---

## 5. Classical vs. Quantum Comparison

* **Classical Baseline / Counterpart:**  
  * **Exact Classical Solver:** Exhaustive integer enumeration across all $2^7 = 128$ binary decision states. Finds the certified global optimum (objective $6.0$) with zero constraint violations in $3.4\text{ ms}$.
  * **Objective-Aware Greedy Solver:** Forward-greedy heuristic guided by marginal objective reduction ($\Delta F$) with 1-opt local search. Resolves the regression of naive priority-first greedy (which scored $11.0$, worse than doing nothing), achieving objective $7.0$ in $0.9\text{ ms}$.
  * **Uniform Random Sampling Control:** Shot-matched ($1,024$ shots) uniform random sampler over the same 12-qubit register, applying identical post-selection. Added to rigorously test whether QAOA provides an advantage over random search.

* **Comparative Analysis:**  
  * **Approximation Ratio ($C_{\text{quantum}} / C_{\text{optimal}}$):** $\mathbf{1.00}$ (QAOA reaches the optimal objective $6.0$ in 14 of 15 recorded runs across seeds and depths).
  * **Feasibility Yield:** QAOA concentrates probability mass on feasible states ($74.6\%$ feasible samples at $p=1$, $63.0\%$ at $p=2$, $65.5\%$ at $p=3$) compared to $50.8\%$ for uniform random sampling.
  * **Random Control Reality:** Because 3 of 128 states are optimal on this small synthetic instance, a shot-matched uniform random sampler draws an optimal state in **15 of 15 runs** (failure probability is $(1 - 3/128)^{1024} \approx 3.2 \times 10^{-11}$). Consequently, best-of-1024 post-selection cannot separate QAOA from random search on this problem size.
  * **Runtime:** Exact classical enumeration takes $\approx 3.5\text{ ms}$. QAOA statevector simulation takes $\approx 330\text{ ms} - 730\text{ ms}$. Classical enumeration is vastly faster on small instances.

---

## 6. Performance, Results & Limitations

* **Key Results & Observations:**  

| Solver | Depth ($p$) | Feasible Rate | Hit Optimum Rate | Objective (Mean $\pm$ SD) | Median Runtime | Feasible Sample Ratio |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Greedy (Objective-Aware)** | — | 100% | 0% | $7.000 \pm 0.000$ | $0.0009\text{ s}$ | — |
| **Exact Classical (Optimal)** | — | 100% | 100% | $6.000 \pm 0.000$ | $0.0035\text{ s}$ | — |
| **QAOA (Quantum Heuristic)** | 1 | 100% | 80% | $6.200 \pm 0.447$ | $0.3279\text{ s}$ | $74.6\%$ |
| **QAOA (Quantum Heuristic)** | 2 | 100% | 100% | $6.000 \pm 0.000$ | $0.5501\text{ s}$ | $63.0\%$ |
| **QAOA (Quantum Heuristic)** | 3 | 100% | 100% | $6.000 \pm 0.000$ | $0.7304\text{ s}$ | $65.5\%$ |
| **Uniform Random Control** | — | 100% | 100% | $6.000 \pm 0.000$ | $0.0003\text{ s}$ | $50.8\%$ |

  * **Fairness Score vs. Disparity Metric Separation:** Range-based `fairness_score` ($1 - (\max s - \min s) = 0.50$) and quadratic `disparity` ($\sum (s_i - s_j)^2 = 0.75$) are distinct mathematical quantities that can invert rankings. Both are reported explicitly to prevent conflation.
  * **Modal Bitstring vs. Post-Selection:** In multiple runs, the modal (most frequent) measured bitstring was infeasible. The reported solution is obtained via classical post-selection of the best feasible bitstring.

* **Critical Reflection on Limitations:**  
  * **No Quantum Advantage Claimed:** On this synthetic benchmark, classical enumeration is two orders of magnitude faster than QAOA statevector simulation. Quantum advantage cannot be claimed or inferred.
  * **Noiseless Simulation:** QAOA was executed on a classical CPU simulator (`StatevectorSampler`). Physical quantum processors (QPUs) would suffer from two-qubit gate errors, decoherence, and readout infidelities, necessitating quantum error mitigation (QEM) and deeper shot budgets.
  * **Qubit Scaling Overhead:** Unary slack encoding adds qubits linearly with constraint bounds. For larger municipal networks with higher reservoir capacities, binary or logarithmic slack encoding would be required to avoid prohibitive qubit registers.
  * **Synthetic Data Scope:** All scenarios are synthetic benchmarks designed to evaluate combinatorial algorithms. They do not represent real-time municipal hydraulic piping or pressure networks.

---

## 7. References & Acknowledgments

* **Hackathon Reference Guide:** The optimization pipeline structure (binary decisions, quadratic constraint penalties, Ising mapping, QAOA simulation, comparison with exact baselines, and feasibility yield metrics) follows the Track 2 educational reference guide in [Qiskit-Fall-Fest-2026-IIITKottayam-Hackathon-Template](https://github.com/Shanwis/Qiskit-Fall-Fest-2026-IIITKottayam-Hackathon-Template/tree/main/references/track-2-optimization) (MIT License).
* **Quantum Algorithm Foundations:** E. Farhi, J. Goldstone, S. Gutmann, *A Quantum Approximate Optimization Algorithm*, 2014, [arXiv:1411.4028](https://arxiv.org/abs/1411.4028).
* **Software Ecosystem:** [Qiskit](https://github.com/Qiskit/qiskit) (Apache 2.0), [NumPy](https://numpy.org/) (BSD), [SciPy](https://scipy.org/) (BSD), [Streamlit](https://streamlit.io/) (Apache 2.0), [Plotly](https://plotly.com/) (MIT), [Pandas](https://pandas.pydata.org/) (BSD).
* **Independent Auditing:** The independent mathematical audit and verification methodology was developed by the validation workstream (`claude/validation`).
