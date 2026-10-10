# WATERWEAVE Benchmark Results & Provenance

This directory stores reproducible benchmark datasets comparing Exact Classical, Objective-Aware Greedy, Uniform Random Control, and QAOA ($p \in \{1, 2, 3\}$).

## Primary Reproducible Datasets (Updated Engine)

* `benchmark_default.json` / `benchmark_default.csv`:
  - **Instance:** `synthetic-4x2` (4 neighborhoods, 2 time slots, 128 decision patterns, 12 qubits with slack encoding).
  - **Engine Commit:** `f5fe6b0` / `b2d63b7` (includes objective-aware 1-opt greedy baseline, rich QAOA telemetry, and random-control sampling).
  - **Parameters:** $\alpha = 2.0$, $P = 15.0$, shots $= 1024$, seeds $\in \{0, 1, 2, 3, 4\}$, COBYLA evaluations $= 25$.
  - **Environment:** Python 3.12, Qiskit 2.5.2, NumPy 2.4.6, SciPy 1.18.0.

* `benchmark_small.json` / `benchmark_small.csv`:
  - **Instance:** `small` (3 neighborhoods, 2 time slots, 32 decision patterns, 8 qubits with slack encoding).
  - **Engine Commit:** `f5fe6b0` / `b2d63b7`.

## Archived Independent Audit Datasets (Claude Workstream)

* `audit_engine_9633518/`:
  - Preserved results from the independent mathematical audit conducted on engine commit `9633518` / `c7a6731`.
  - Documents early greedy baseline behavior (pure priority-first without 1-opt search, objective 11.0 vs 7.0) prior to the greedy resolution.
  - Recorded by commit `657af24` (`claude/validation`).
