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

*(Note: Team members above are placeholders for the team registration form. Individual workstream branches `codex/optimization`, `antigravity/dashboard`, `antigravity/live-data-research`, `claude/validation` and `claude/frontend-demo-mode` developed the respective subsystems).*

---

## 1. Project Overview & Motivation

* **Summary (3–4 sentences):**  
  WATERWEAVE models urban municipal water rationing during drought scarcity as a constrained binary quadratic optimization problem. When daily municipal demand strictly exceeds reservoir supply across delivery slots, the system balances weighted emergency priority against neighborhood service-level equity. We formulate the problem as a Quadratic Unconstrained Binary Optimization (QUBO) model and solve it using Qiskit's Quantum Approximate Optimization Algorithm (QAOA) alongside exact integer enumeration and objective-aware greedy classical baselines. A web application with a guided presentation mode shows every step running live on the real engine.

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
  * **Key Gates Used (p = 1):** $H$ (12 state preparation gates), $R_{ZZ}$ (39 two-qubit gates, one per non-zero coupling $J_{kl}$), $R_Z$ (12 single-qubit cost phase rotations), $R_X$ (12 mixer rotations). Circuit depth 17 at $p=1$, 29 at $p=2$, 41 at $p=3$. These counts are reported by the engine (`POST /api/model`) and drawn gate by gate in the web app's Quantum lab.
  * **Primitives Used:** Qiskit `StatevectorSampler` (noiseless statevector simulation).
  * **Other Technologies Used:** React, TypeScript and Vite (web app and guided presentation), FastAPI and Uvicorn (thin API over the engine), Streamlit and Plotly (original dashboard), Pandas, SciPy, NumPy.

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
├── app.py                  # Streamlit dashboard entry point (original dashboard)
├── HACKATHON_GUIDE.md      # Official Qiskit Fall Fest 2026 hackathon guide
├── LICENSE                 # MIT License (Qiskit Fall Fest 2026 template)
├── AGENTS.md               # Multi-agent coordination rules and contracts
├── src/                    # Core WATERWEAVE application package
│   └── waterweave/
│       ├── models.py       # Data models: Scenario, Neighborhood, SolverResult, Allocation
│       ├── scenarios.py    # Synthetic municipal scenario (default 4x2)
│       ├── formulation.py  # QUBO objective, slack variables, and Ising Hamiltonian mapping
│       ├── solvers.py      # Exact enumeration, objective-aware greedy, and Qiskit QAOA engine
│       ├── metrics.py      # Range-based fairness_score, pairwise disparity, feasibility
│       ├── optimization.py # Solver entry point run_comparison() & CLI runner
│       ├── api/            # FastAPI layer for the web app (python -m waterweave.api)
│       ├── data/           # Live/static data providers, cache, scenario builder
│       └── ui/             # Streamlit dashboard adapter, components, styles
├── frontend/               # React + TypeScript web app and guided presentation
│   ├── src/pages/          # Overview, Workspace, Classical vs quantum, Data sources, Quantum lab
│   ├── src/presentation/   # Presentation state machine, controller, preflight, presenter view
│   ├── src/data/recordedRun.json  # Recorded API output, used only if the API is down
│   └── e2e/                # Playwright browser tests
├── notebooks/              # Executed demonstration notebooks
├── references/             # Track 2 hackathon reference materials
├── docs/                   # Mathematical and architectural documentation
│   ├── FORMULATION.md      # QUBO mathematics, slack encoding, penalty bounds
│   ├── QUANTUM_METHOD.md   # Hamiltonian, gates, aliasing, and sampling as implemented
│   ├── VALIDATION.md       # Independent audit and review
│   ├── BENCHMARK_FINDINGS.md # Benchmark tables and random-control analysis
│   ├── FRONTEND_ARCHITECTURE.md # Web app audit, architecture, design and presentation mode
│   ├── DATA_*.md, LIVE_DATA_ARCHITECTURE.md # Data sources, gaps, model and validation
│   ├── INTERFACES.md       # Shared Python contracts and telemetry schema
│   └── PROJECT_SPEC.md     # Hackathon track specifications and design rules
├── scripts/
│   ├── benchmark.py        # Benchmark runner with independent mathematical audit
│   ├── export_demo_snapshot.py # Records the API output used as the offline fallback
│   └── generate_notebook.py# Generates and executes the notebooks
├── benchmark_results/      # Reproducible benchmark datasets and provenance
└── tests/                  # Python tests (pytest), including the API
```

### Installation & Execution Instructions

> 💡 **Environment Recommendation:** Python 3.11 or 3.12 in a fresh virtual environment, and Node.js 22.12 or newer for the web app:
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
2. **Install the Python dependencies** (includes FastAPI and Uvicorn for the web app):
   ```bash
   pip install -r requirements.txt
   pip install -e .
   ```
3. **Build the web app once:**
   ```bash
   cd frontend
   npm ci
   npm run build
   cd ..
   ```
4. **Start WATERWEAVE (API and web app in one process):**
   ```bash
   python -m waterweave.api
   ```
   Open <http://127.0.0.1:8000>. Options: `--port 8080`, `--host 0.0.0.0`, and `--offline` (never contact network data providers; same as `WATERWEAVE_OFFLINE=1`). No API keys or environment variables are needed.

5. **Launch the guided presentation:** press **Present** in the header (or *Start the guided presentation* on the overview). The preflight dialog runs the real engine once, checks live weather, and then offers *Start with the live engine* (or, if the API is down, *Start with the recorded run*). For a second screen, press *Open presenter view* in the dialog, or open <http://127.0.0.1:8000/presenter> in another window of the same browser. Details and controls are in section 4.

6. **Run the tests:**
   ```bash
   pytest                         # Python: engine, metrics, benchmark audit, API, recorded-run check
   cd frontend
   npm test                       # Vitest: components, pages, presentation state machine and controller
   npx playwright install chromium   # once; downloads the test browser
   npm run e2e                    # Playwright: builds the app, starts the API, tests in a real browser
   ```
   `npm run e2e` starts `python -m waterweave.api` itself. Set `WATERWEAVE_PYTHON` to the interpreter that has the project installed (for example `.venv/Scripts/python.exe` on Windows) and, if the browser download is blocked, `PLAYWRIGHT_CHANNEL=msedge` or `chrome` to use an installed browser.

7. **Develop the web app with live reload** (two terminals):
   ```bash
   python -m waterweave.api          # API on port 8000
   cd frontend && npm run dev        # http://localhost:5173, proxies /api to port 8000
   ```
   If the API runs elsewhere, set `WATERWEAVE_API` (for example `WATERWEAVE_API=http://127.0.0.1:8080`) before `npm run dev`.

8. **Other entry points:**
   ```bash
   python -m waterweave.optimization                  # CLI comparison of greedy, exact and QAOA
   streamlit run app.py                               # Original Streamlit dashboard
   python scripts/benchmark.py                        # Benchmark, default 4x2 instance (seeds 0..4, p=1..3)
   python scripts/benchmark.py --instance small       # Small 3x2 instance
   python scripts/export_demo_snapshot.py             # Re-record the offline fallback after engine changes
   jupyter notebook notebooks/waterweave_demo.ipynb   # Executed walkthrough notebook
   ```

* **Troubleshooting:**
  * *The page says "The WATERWEAVE API is not reachable":* start `python -m waterweave.api`, then press *Retry*. To present without it, choose *Show recorded run*; everything shown is then labelled as recorded.
  * *`http://127.0.0.1:8000` shows "WATERWEAVE API is running" instead of the app:* the frontend has not been built; run step 3 and restart the API.
  * *A page says it "could not be displayed":* the API and the built frontend are different versions. Rebuild the frontend and restart the API.
  * *QAOA says "Not run: this scenario needs N qubits":* live simulation is limited to 15 qubits so results return in seconds (measured: 0.45 s at 12 qubits, 3.9 s at 15, over a minute at 18). Greedy and exact search still run.
  * *Live weather is unavailable:* nothing depends on it. The data page shows the error; use `--offline` to skip the network entirely.
  * *`pytest` reports "Invalid statement" for `pyproject.toml`:* an older checkout began with a UTF-8 byte-order mark; this branch does not.

---

## 4. Implementation Walkthrough & Live Demo

* **Walkthrough of Gameplay / Optimization Pipeline:**  
  1. **Scenario Ingestion:** The municipal scenario specifies 4 neighborhoods and 2 delivery slots. Total demand is 7 units; total supply is 4 units (forcing a 3-unit shortfall).
  2. **Model Compilation:** Ineligible decision variables where demand is zero are pruned, creating 7 binary decision variables. Reservoir supply and cistern storage bounds are converted into equalities using 5 unary slack bits.
  3. **Ising Hamiltonian Formulation:** The QUBO objective is transformed into a 12-qubit diagonal Ising Hamiltonian $H_C$.
  4. **QAOA Execution:** A $p$-layer variational circuit is prepared in superposition. COBYLA tunes variational angles $(\vec{\gamma}, \vec{\beta})$. The circuit is sampled across 1,024 shots with Qiskit's `StatevectorSampler`.
  5. **Decoding & Classical Post-Selection:** Measured bitstrings are mapped back to neighborhood delivery tables. The solver selects the best feasible candidate with consistent slack energy.
  6. **Web app and dashboard:** The web app shows every result from the engine through a thin API; the original Streamlit dashboard and its Quantum Inspector remain available.

### Web application

Architecture: a React + TypeScript (Vite) frontend calls a FastAPI layer (`src/waterweave/api`) that wraps the existing engine; the API calls `run_comparison`, `evaluate_allocation`, `evaluate_objective`, `build_model` and the data registry and adds no mathematics of its own. Decisions, the audit of the starting point and the design system are recorded in `docs/FRONTEND_ARCHITECTURE.md`.

| Page | What it shows |
| :--- | :--- |
| **Overview** | The problem in the scenario's own numbers ("Seven deliveries requested. Water for four."), the day's requests drawn as a weave, and short answers to the questions a judge asks first, with benchmark counts read from the recorded results. |
| **Workspace** | Edit the scenario on its weave (select a crossing to add or remove a request; set supply, priority weight and storage), choose the fairness weight and QAOA settings, see the model size in qubits, and run greedy, exact and QAOA on the engine. Each plan is drawn as a weave with its score, requests met, weighted shortage, fairness score, rule check, run time and gap to the exact optimum. "Who was served" charts each neighborhood's met share, next to the "deliver nothing" reference. |
| **Classical vs quantum** | All three solvers on the same scenario and score, the recorded multi-seed benchmark with a shot-matched random-sampling control and its six audit checks, and "what this shows and what it does not", where each statement is built from the numbers. |
| **Data sources** | Every input labelled as live, cached, illustrative, synthetic or unavailable, with observation and retrieval times, and what the data would change. |
| **Quantum lab** | Eight steps from yes/no decisions to measurement, each in plain words first with the mathematics behind a disclosure: the QUBO coefficient grid, the Ising fields, the exact circuit QAOA ran (drawn from its gate list and tuned angles), and decoded samples. |

A failed solver is shown as failed with its reason; no other solver's result is put in its place. In the allocation weave, a blue crossing thread is a delivered unit and an open red ring an unmet request; every crossing also carries a text state for screen readers.

### Guided presentation mode

A pure state machine (`frontend/src/presentation/machine.ts`) drives nine steps through the real app, about four minutes at the standard pace:

1. The problem, 2. The scenario (loads the synthetic default), 3. The rules, 4. Classical solvers (runs greedy and exact on the engine), 5. Quantum optimisation (runs QAOA on the engine), 6. Results and fairness, 7. Data integrity (fetches the data sources; offline view if the network is down), 8. Honest comparison (recorded benchmark with the random control), 9. Conclusion.

Each step navigates to its page, scrolls to and outlines the element it is about, and runs its real action. Captions for the audience and notes for the presenter are generated from the actual results, so no number is read out that the engine has not produced.

| Control | Button | Key |
| :--- | :--- | :--- |
| Pause / resume | Pause, Resume | Space |
| Next / previous step | Next step, Previous step | Right or Left arrow, Page Down or Page Up (presentation clickers) |
| Jump to a step | Progress segments | |
| Restart | Restart | Home |
| Presenter notes | Notes button | N |
| Clean audience view (hides navigation and controls) | Eye button | H |
| Exit | Exit | Esc |

* **Automatic or manual:** progression is automatic by default; switch *Advance automatically* off in the preflight to move only by hand. The pace (quick check about 1 minute, brisk, standard about 4 minutes, relaxed, slow) is set in the preflight.
* **Timing:** pausing stops the clock at once and resuming continues from the same point. While a solver run or fetch is in flight, the clock waits ("Waiting for the engine"). If a step fails, the walkthrough pauses with the reason and a *Retry* button; *Next* always works.
* **Presenter view:** `/presenter` in a second window shows the current chapter, time left, notes, what the audience reads, the next step, and large controls. It is linked to the main window over `BroadcastChannel` (same browser, no server involved) and only sends commands.
* **Offline:** the solvers run locally and need no internet. If live weather is unavailable the data step says so. If the API itself is down, *Start with the recorded run* uses `frontend/src/data/recordedRun.json`, real API output recorded by `scripts/export_demo_snapshot.py` and checked against the engine by `tests/test_recorded_snapshot.py`; a banner states when and from which commit it was recorded, and every result is labelled "Recorded run".

### Live municipal data integration

* **Open-Meteo (verified live):** current rainfall for Bengaluru, fetched with a 10-second timeout and cached for 5 minutes. It is **shown for context only**: the rainfall-to-supply heuristic in `ScenarioBuilder` is disabled by default, because rain falling today does not establish how much water the utility can pipe today.
* **Population (illustrative):** the `bbmp_static` provider returns illustrative ward populations, **not verified census records**. They only set priority weights (population ÷ 25,000) in the optional *Illustrative population weights* preset.
* **Synthetic:** all demand, supply and storage figures in every scenario.
* **Unavailable:** there is no public real-time API for BWSSB reservoir levels, pipe flow or ward-level demand (`docs/DATA_SOURCES.md`, `docs/DATA_GAPS.md`); none is claimed.
* **Resilience:** a failed fetch is reported as missing with its error, never replaced by an invented value, and no scenario depends on live data.

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

* **Reading the comparison in the web app:** the *Classical vs quantum* page runs all three solvers on the scenario in the workspace with one shared score, shows the gap to the exact optimum, and states how many times longer the QAOA simulation took, which is the cost of simulating a circuit on a laptop and says nothing about quantum hardware. Below it, the recorded benchmark adds the random control and the probability that one sample is optimal (exactly 3/128 for random sampling; for QAOA, the probability in the simulated state). Its "what this shows and what it does not" list is generated from those numbers and would change its wording if they changed.

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
  * **Test suite (measured on this branch):** 142 Python tests pass and 1 optional live-fetch test is skipped; 98 Vitest tests and 21 Playwright browser tests pass. The browser tests play the full presentation on the real engine and include an axe-core WCAG 2.1 AA audit with no serious or critical violations.

* **Critical Reflection on Limitations:**  
  * **No Quantum Advantage Claimed:** On this synthetic benchmark, classical enumeration is two orders of magnitude faster than QAOA statevector simulation. Quantum advantage cannot be claimed or inferred.
  * **Noiseless Simulation:** QAOA was executed on a classical CPU simulator (`StatevectorSampler`). Physical quantum processors (QPUs) would suffer from two-qubit gate errors, decoherence, and readout infidelities, necessitating quantum error mitigation (QEM) and deeper shot budgets.
  * **Qubit Scaling Overhead:** Unary slack encoding adds qubits linearly with constraint bounds. For larger municipal networks with higher reservoir capacities, binary or logarithmic slack encoding would be required to avoid prohibitive qubit registers.
  * **Synthetic Data Scope:** All scenarios are synthetic benchmarks designed to evaluate combinatorial algorithms. They do not represent real-time municipal hydraulic piping or pressure networks.
  * **Web app limits:** live QAOA is limited to 15 qubits; the recorded fallback covers only the default scenario with default settings; per-slot demand is 0 or 1 because each decision delivers one unit; on phones the scenario editor scrolls sideways. The presenter view needs both windows in the same browser.

---

## 7. References & Acknowledgments

* **Hackathon Reference Guide:** The optimization pipeline structure (binary decisions, quadratic constraint penalties, Ising mapping, QAOA simulation, comparison with exact baselines, and feasibility yield metrics) follows the Track 2 educational reference guide in [Qiskit-Fall-Fest-2026-IIITKottayam-Hackathon-Template](https://github.com/Shanwis/Qiskit-Fall-Fest-2026-IIITKottayam-Hackathon-Template/tree/main/references/track-2-optimization) (MIT License).
* **Quantum Algorithm Foundations:** E. Farhi, J. Goldstone, S. Gutmann, *A Quantum Approximate Optimization Algorithm*, 2014, [arXiv:1411.4028](https://arxiv.org/abs/1411.4028).
* **Data:** Weather data by [Open-Meteo](https://open-meteo.com/) (CC BY 4.0).
* **Software Ecosystem:** [Qiskit](https://github.com/Qiskit/qiskit) (Apache 2.0), [NumPy](https://numpy.org/) (BSD), [SciPy](https://scipy.org/) (BSD), [Streamlit](https://streamlit.io/) (Apache 2.0), [Plotly](https://plotly.com/) (MIT), [Pandas](https://pandas.pydata.org/) (BSD), [FastAPI](https://fastapi.tiangolo.com/) (MIT), [Uvicorn](https://www.uvicorn.org/) (BSD), [React](https://react.dev/) (MIT), [React Router](https://reactrouter.com/) (MIT), [Vite](https://vite.dev/) (MIT), [TypeScript](https://www.typescriptlang.org/) (Apache 2.0), [Lucide](https://lucide.dev/) icons (ISC), [Vitest](https://vitest.dev/) (MIT), [Testing Library](https://testing-library.com/) (MIT), [Playwright](https://playwright.dev/) (Apache 2.0).
* **Fonts:** Barlow Condensed (Jeremy Tribby) and Atkinson Hyperlegible Next (Braille Institute), both SIL Open Font License, bundled through [Fontsource](https://fontsource.org/).
* **Independent Auditing:** The independent mathematical audit and verification methodology was developed by the validation workstream (`claude/validation`).
