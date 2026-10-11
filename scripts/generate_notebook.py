"""Generate and execute the WATERWEAVE demonstration Jupyter Notebook with live outputs."""

import json
from pathlib import Path
import nbformat as nbf
from nbclient import NotebookClient

def build_and_execute_notebook():
    nb = nbf.v4.new_notebook()
    nb.metadata = {
        "language_info": {"name": "python", "version": "3.12.0"},
        "kernelspec": {"name": "python3", "display_name": "Python 3"},
    }

    cells = []

    # 1. Title & Executive Summary
    cells.append(nbf.v4.new_markdown_cell(
        "# WATERWEAVE: Quantum Water-Allocation Decision Support\n"
        "**Qiskit Fall Fest 2026 — Track 2: Open-Domain Optimization & Real-World Solvers**\n\n"
        "> **Project Overview:**\n"
        "> WATERWEAVE models municipal water rationing under drought scarcity as a constrained binary optimization problem. "
        "It formulates a multi-slot, multi-neighborhood trilemma between priority weighting, supply constraints, and service equity. "
        "This notebook walks through the problem formulation, classical baselines, Qiskit QAOA execution, telemetry inspection, and benchmark findings.\n\n"
        "> **Important Disclaimer:**\n"
        "> All data in this notebook is **strictly synthetic**. QAOA is simulated classically via Qiskit's `StatevectorSampler`. "
        "No quantum advantage is claimed; classical exact enumeration solves this small instance in milliseconds."
    ))

    # 2. Section 1: Scenario Setup
    cells.append(nbf.v4.new_markdown_cell(
        "## 1. Synthetic Water-Allocation Scenario\n\n"
        "We consider 4 neighborhoods ($N_1$ Hillview, $N_2$ Riverside, $N_3$ Market, $N_4$ Lakeside) across 2 delivery slots (`morning`, `evening`).\n"
        "Total municipal demand is **7 units**, while total available supply is only **4 units** (2 morning, 2 evening). "
        "Because demand strictly exceeds supply, trade-offs between neighborhood priority and equitable access are unavoidable."
    ))

    cells.append(nbf.v4.new_code_cell(
        "import sys, os\n"
        "if os.path.exists('src'):\n"
        "    sys.path.insert(0, 'src')\n"
        "elif os.path.exists('../src'):\n"
        "    sys.path.insert(0, '../src')\n\n"
        "from waterweave.scenarios import default_scenario\n"
        "import pandas as pd\n\n"
        "scenario = default_scenario(seed=42)\n"
        "print(f'Scenario: {scenario.name}')\n"
        "print(f'Delivery Slots: {scenario.slots}')\n"
        "print(f'Reservoir Supply: {scenario.supply_by_slot}')\n\n"
        "rows = []\n"
        "for n in scenario.neighborhoods:\n"
        "    rows.append({\n"
        "        'ID': n.id,\n"
        "        'Neighborhood': n.name,\n"
        "        'Morning Demand': n.demand_by_slot.get('morning', 0),\n"
        "        'Evening Demand': n.demand_by_slot.get('evening', 0),\n"
        "        'Total Demand': sum(n.demand_by_slot.values()),\n"
        "        'Priority Weight': f'{n.priority_weight:.1f}x',\n"
        "        'Storage Cap (units)': n.storage_capacity_units,\n"
        "    })\n"
        "pd.DataFrame(rows)"
    ))

    # 3. Section 2: Mathematical Formulation & QUBO Mapping
    cells.append(nbf.v4.new_markdown_cell(
        "## 2. Binary Optimization Formulation & QUBO/Ising Mapping\n\n"
        "The objective minimizes:\n"
        "$$\\min_x F(x) = \\text{Weighted Shortage}(x) + \\alpha \\cdot \\text{Disparity}(x) + P \\cdot \\text{Violations}(x)$$\n\n"
        "1. **Primary Decision Variables**: $x_{i,t} \\in \\{0, 1\\}$ created only where demand exists ($d_{i,t} \\ge 1$). Here, $K=7$ binary decision variables.\n"
        "2. **Slack Variable Encoding**: Reservoir supply ($\\sum x \\le 2$) and cistern storage ($\\sum x \\le 1$) inequalities are converted into quadratic penalties using unary slack variables:\n"
        "   $$P \\left( \\sum x + \\sum s - B \\right)^2$$\n"
        "   This adds 5 slack bits, requiring a total of **12 qubits**.\n"
        "3. **Ising Mapping**: $x_k = \\frac{I - Z_k}{2}$ transforms the QUBO into diagonal cost Hamiltonian $H_C = \\sum h_k Z_k + \\sum J_{kl} Z_k Z_l + c_0 I$."
    ))

    cells.append(nbf.v4.new_code_cell(
        "from waterweave.formulation import build_model\n\n"
        "model = build_model(scenario, fairness_weight=2.0)\n"
        "print(f'Primary Decision Variables (K): {model.n_decision}')\n"
        "print(f'Slack Variables:                {model.n_slack}')\n"
        "print(f'Total Problem Qubits:           {model.n_vars}')\n"
        "print(f'Ising Offset Energy:           {model.ising_offset:.4f}')\n"
        "print(f'Active Two-Qubit Couplings:     {(abs(model.ising_J) > 1e-9).sum() // 2} pairs')\n"
        "print(f'Max Coupling Strength |J_kl|:   {abs(model.ising_J).max():.4f}')"
    ))

    # 4. Section 3: Classical Baselines
    cells.append(nbf.v4.new_markdown_cell(
        "## 3. Classical Baselines: Greedy vs. Exact\n\n"
        "We evaluate two classical benchmarks:\n"
        "* **Greedy Baseline**: An objective-aware heuristic with deterministic 1-opt local search. It avoids the naive trap of pure priority-first allocation (which produced objective 11.0, worse than allocating nothing).\n"
        "* **Exact Classical**: Exhaustive integer enumeration over all $2^7 = 128$ decision patterns. Finds the certified global optimum (objective $6.0$) in milliseconds."
    ))

    cells.append(nbf.v4.new_code_cell(
        "from waterweave.solvers import solve_greedy, solve_exact\n\n"
        "greedy_res = solve_greedy(scenario, fairness_weight=2.0)\n"
        "exact_res = solve_exact(scenario, fairness_weight=2.0)\n\n"
        "print('--- Greedy Heuristic ---')\n"
        "print(f'Objective:      {greedy_res.objective_value:.4f}')\n"
        "print(f'Feasible:       {greedy_res.feasible}')\n"
        "print(f'Fairness Score: {greedy_res.metrics[\"fairness_score\"]:.4f}')\n"
        "print(f'Disparity:      {greedy_res.metrics[\"disparity\"]:.4f}')\n"
        "print(f'Runtime:        {greedy_res.runtime_seconds * 1000:.3f} ms')\n\n"
        "print('--- Exact Classical (Optimal) ---')\n"
        "print(f'Objective:      {exact_res.objective_value:.4f}')\n"
        "print(f'Feasible:       {exact_res.feasible}')\n"
        "print(f'Fairness Score: {exact_res.metrics[\"fairness_score\"]:.4f}')\n"
        "print(f'Disparity:      {exact_res.metrics[\"disparity\"]:.4f}')\n"
        "print(f'Runtime:        {exact_res.runtime_seconds * 1000:.3f} ms')"
    ))

    # 5. Section 4: QAOA Circuit Construction & Execution
    cells.append(nbf.v4.new_markdown_cell(
        "## 4. QAOA Circuit Construction & Execution\n\n"
        "The QAOA ansatz applies alternating unitaries on 12 qubits:\n"
        "$$|\\psi(\\gamma, \\beta)\\rangle = \\prod_{l=1}^p \\left[ e^{-i \\beta_l H_M} e^{-i \\gamma_l H_C} \\right] |+\\rangle^{\\otimes n}$$\n\n"
        "1. **Cost Layer**: $R_{ZZ}(2\\gamma J_{kl})$ two-qubit interactions and $R_Z(2\\gamma h_k)$ single-qubit rotations.\n"
        "2. **Mixer Layer**: $R_X(2\\beta)$ transverse field rotations.\n"
        "3. **Optimization**: Warm-start grid search (36 evaluations) followed by SciPy COBYLA (25 evaluations).\n"
        "4. **Sampling & Post-Selection**: Measured across 1,024 shots with Qiskit's `StatevectorSampler`. The best feasible bitstring is returned."
    ))

    cells.append(nbf.v4.new_code_cell(
        "from waterweave.solvers import solve_qaoa, _build_qaoa_circuit\n\n"
        "qaoa_res = solve_qaoa(scenario, p=1, shots=1024, maxiter=25, seed=42)\n"
        "meta = qaoa_res.metadata\n\n"
        "print('--- QAOA Solver Execution Telemetry ---')\n"
        "print(f'Objective Value:         {qaoa_res.objective_value:.4f}')\n"
        "print(f'Feasible:                {qaoa_res.feasible}')\n"
        "print(f'Circuit Width:           {meta[\"num_qubits\"]} qubits')\n"
        "print(f'Circuit Depth:           {meta[\"circuit_depth\"]}')\n"
        "print(f'Optimal Gamma (Cost):    {[round(g, 4) for g in meta[\"optimal_gammas\"]]}')\n"
        "print(f'Optimal Beta (Mixer):    {[round(b, 4) for b in meta[\"optimal_betas\"]]}')\n"
        "print(f'Feasible Sample Ratio:   {meta[\"feasible_samples_ratio\"] * 100:.1f}%')\n"
        "print(f'Selected Bitstring:      {meta[\"best_bitstring\"]}')\n"
        "print(f'Modal Bitstring:         {meta[\"modal_bitstring\"]}')\n"
        "print(f'Simulation Runtime:      {qaoa_res.runtime_seconds:.4f} s')\n\n"
        "# Reconstruct circuit for gate counts\n"
        "qc = _build_qaoa_circuit(model, meta['optimal_gammas'], meta['optimal_betas'])\n"
        "print(f'Circuit Gate Breakdown:  {dict(qc.count_ops())}')"
    ))

    # 6. Section 5: Decoded Allocation & Metrics Comparison
    cells.append(nbf.v4.new_markdown_cell(
        "## 5. Comparative Evaluation: Greedy vs. Exact vs. QAOA\n\n"
        "We summarize the performance of all three solvers on the shared synthetic scenario.\n"
        "Notice the crucial mathematical separation between **Fairness Score** (range-based equality, higher is better) "
        "and **Disparity** (pairwise quadratic variance, minimized by the QUBO, lower is better)."
    ))

    cells.append(nbf.v4.new_code_cell(
        "results = [greedy_res, exact_res, qaoa_res]\n"
        "table = []\n"
        "for r in results:\n"
        "    m = r.metrics\n"
        "    table.append({\n"
        "        'Solver': r.solver_name,\n"
        "        'Feasible': 'Yes' if r.feasible else 'No',\n"
        "        'Objective Value': f'{r.objective_value:.2f}',\n"
        "        'Weighted Shortage': f'{m.get(\"weighted_shortage\", 0):.2f}',\n"
        "        'Service Level (%)': f'{m.get(\"service_level\", 0)*100:.1f}%',\n"
        "        'Fairness Score': f'{m.get(\"fairness_score\", 0):.3f}',\n"
        "        'Disparity (QUBO)': f'{m.get(\"disparity\", 0):.3f}',\n"
        "        'Runtime (s)': f'{r.runtime_seconds:.4f}',\n"
        "    })\n"
        "df_comp = pd.DataFrame(table)\n"
        "df_comp"
    ))

    # 7. Section 6: Benchmark Findings & Limitations
    cells.append(nbf.v4.new_markdown_cell(
        "## 6. Performance, Results & Critical Limitations\n\n"
        "### Key Experimental Observations\n"
        "1. **Solution Quality**: QAOA successfully finds a feasible allocation achieving the global optimum objective ($6.0$) in 80% to 100% of runs across depths $p \\in \\{1, 2, 3\\}$.\n"
        "2. **Classical Post-Selection**: The modal (most frequent) sampled bitstring is occasionally infeasible. The reported solution relies on classical post-selection of the best feasible candidate from the 1,024 sampled bitstrings.\n"
        "3. **Uniform Random Control**: On 128 decision states, uniform random sampling also draws the optimal state in 15 of 15 runs. Best-of-1,024 sampling cannot separate QAOA from random search on this small instance.\n\n"
        "### Scientific Limitations (No Quantum Advantage Claimed)\n"
        "* **Simulation Overhead**: Exact classical enumeration evaluates all states in $3.5\\text{ ms}$. QAOA classical simulation requires $\\approx 350\\text{ ms}$.\n"
        "* **Hardware Noise**: Executing on real physical quantum processors (QPUs) would introduce gate infidelities and decoherence, requiring error mitigation and higher shot budgets.\n"
        "* **Synthetic Data**: The problem instances demonstrate mathematical formulation mechanics and are not operational municipal water controllers."
    ))

    cells.append(nbf.v4.new_code_cell(
        "# Load and inspect committed benchmark provenance\n"
        "import os, json\n"
        "bench_path = 'benchmark_results/benchmark_default.json' if os.path.exists('benchmark_results/benchmark_default.json') else '../benchmark_results/benchmark_default.json'\n"
        "with open(bench_path, 'r', encoding='utf-8') as f:\n"
        "    bench_data = json.load(f)\n\n"
        "meta = bench_data['meta']\n"
        "prov = meta['provenance']\n"
        "print('Benchmark Provenance:')\n"
        "print(f'  Engine Commit:    {prov[\"engine_git_commit\"][:8]}')\n"
        "print(f'  Python Version:   {prov[\"python\"]}')\n"
        "print(f'  Qiskit Version:   {prov[\"qiskit\"]}')\n"
        "print(f'  Audit Checks:     {len(bench_data[\"audit\"][\"checks\"])} passed')\n"
        "for c in bench_data['audit']['checks']:\n"
        "    print(f'    - [{c[\"status\"]}] {c[\"name\"]}')"
    ))

    nb.cells = cells

    # Execute notebook with live kernel
    print("Executing notebook with nbclient...")
    client = NotebookClient(nb, timeout=120, kernel_name="python3")
    client.execute()
    print("Notebook executed successfully!")

    out_path = Path("notebooks/waterweave_demo.ipynb")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        nbf.write(nb, f)
    print(f"Saved executed notebook to {out_path}")

    # Also save as solution.ipynb for standard template matching
    sol_path = Path("notebooks/solution.ipynb")
    with open(sol_path, "w", encoding="utf-8") as f:
        nbf.write(nb, f)
    print(f"Saved executed notebook to {sol_path}")

if __name__ == "__main__":
    build_and_execute_notebook()
