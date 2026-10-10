# WATERWEAVE

Fair and resilient water allocation using Qiskit optimization.

WATERWEAVE is a hackathon prototype that compares a QAOA-based
quantum optimization workflow against greedy and exact classical
baselines on small, transparent water-allocation scenarios.

All demonstration data is synthetic unless explicitly cited.
This prototype is not an operational water-distribution controller.

## Quick start

1. Create a Python virtual environment.
2. Install `pip install -e ".[dev]"`.
3. Run tests with `pytest`.
4. Launch the dashboard with `streamlit run app.py`.

See `docs/PROJECT_SPEC.md` and `docs/INTERFACES.md`.

## Methodology

The optimisation model, QUBO/Ising mapping, QAOA circuit and decoding as
actually implemented are described in `docs/QUANTUM_METHOD.md`. The review of
the objective, its incentives and open issues is in `docs/VALIDATION.md`.
Solvers are compared on the **same objective** (weighted shortage +
`alpha` x pairwise service-level disparity + squared constraint
violations). The reported `fairness_score` (higher is better, range based) is
a different quantity from the disparity term that is optimised; see
`docs/VALIDATION.md` section 2.1.

QAOA here is a noiseless statevector simulation on a tiny synthetic
instance. No quantum advantage is claimed and none can be inferred from it.

## Reproducing the benchmark

Needs the optimisation engine (`waterweave.optimization.run_comparison`,
currently on branch `codex/optimization`) in addition to this branch's
scenario and metrics modules.

```bash
git clone <repository-url> waterweave && cd waterweave
git checkout codex/optimization      # engine; or main once it is merged
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

python -m pytest                     # unit tests (engine-dependent ones skip if absent)
python scripts/benchmark.py          # default 4x2 instance, p=1..3, seeds 0..4
python scripts/benchmark.py --instance small   # reduced 3x2 instance
```

Outputs are written to `benchmark_results/benchmark_<instance>.csv` and
`.json` (override with `--out-dir`). The JSON records the engine's git
commit, library versions, command line, all parameters, the independent
audit results, per-run rows and summary statistics. Exit code `2` means the
engine could not be imported (nothing is written); `3` means a QAOA run
failed or was not returned (recorded, never replaced by a classical result);
`4` means an audit check failed.

Useful options: `--seeds 0 1 2`, `--p-values 1 2`, `--shots 2048`,
`--maxiter 50`, `--fairness-weight 2.0`, `--penalty-weight 15`,
`--skip-audit`, `--no-random-control`. Python >= 3.11, Qiskit 2.5.x.
The committed results were produced with Python 3.12, Qiskit 2.5.2,
NumPy 2.4.6, SciPy 1.18.0 on Windows 11.

Note: if `pytest` fails with "Invalid statement at line 1, column 1" for
`pyproject.toml`, the file begins with a UTF-8 byte-order mark; remove it
(already fixed on `codex/optimization`).

## Attribution

* The pipeline structure (binary variables, penalised cost, Ising mapping,
  QAOA with COBYLA and a statevector sampler, comparison with brute force,
  approximation ratio and feasibility-yield metrics) follows the Track 2
  reference guide in
  [Qiskit-Fall-Fest-2026-IIITKottayam-Hackathon-Template](https://github.com/Shanwis/Qiskit-Fall-Fest-2026-IIITKottayam-Hackathon-Template/tree/main/references/track-2-optimization)
  (MIT licence). Its starter notebook (B. Tirado, BasQ Qiskit Fall Fest 2026;
  code Apache-2.0, text CC BY 4.0) is the pattern for the sampling and
  little-endian decoding steps. No code from the notebook was copied into
  `scripts/benchmark.py` or the validation modules; the engine's authors
  should confirm what, if anything, they adapted.
* E. Farhi, J. Goldstone, S. Gutmann, *A Quantum Approximate Optimization
  Algorithm*, 2014, [arXiv:1411.4028](https://arxiv.org/abs/1411.4028).
* Qiskit, NumPy and SciPy under their own licences.
