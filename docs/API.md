# WATERWEAVE HTTP API

`python -m waterweave.api` serves this API and the built web app on one port
(default `127.0.0.1:8000`; `--port`, `--host`, `--offline`). Interactive
schema: `/docs` (FastAPI's OpenAPI page). Source: `src/waterweave/api/`.

The API adds no mathematics. Every number comes from the existing engine:
`run_comparison`, `evaluate_allocation`, `evaluate_objective`, `build_model`
and the data provider registry. A solver that fails is reported as failed;
its result is never replaced by another solver's.

## Endpoints

| Method and path | Purpose |
|---|---|
| `GET /api/health` | Status, Python/Qiskit/NumPy/SciPy versions, live QAOA qubit limit, offline mode, whether the frontend is built. |
| `GET /api/presets` | Named scenarios: `default` (the synthetic 4x2), `drought`, `ample`, `lakeside-priority` (all synthetic), `illustrative-population` (weights from illustrative population figures). |
| `POST /api/solve` | Run greedy, exact and optionally QAOA on a scenario. Body: `{scenario, settings}`. |
| `POST /api/model` | The QUBO and Ising model of a scenario and the circuit structure for p = 1..3. Body: `{scenario, fairness_weight, penalty_weight?}`. |
| `POST /api/evaluate` | Score any allocation with the shared metrics and objective. Body: `{scenario, allocation, fairness_weight, penalty_weight?}`. |
| `GET /api/data-sources?live=&refresh=` | Provider observations with quality status, timestamps, ages and cache flag, plus what the scenario builder would change. `live=false` (or offline mode) skips network providers; `refresh=true` clears the 5-minute cache. |
| `GET /api/benchmark` | The committed `benchmark_results/benchmark_{default,small}.json` summaries, audit checks and facts, with provenance. 404 if absent. |

Anything else under `/api/` is a JSON 404. Other paths serve the web app.

## Scenario and settings

```json
{
  "scenario": {
    "name": "synthetic-4x2",
    "slots": ["morning", "evening"],
    "supply_by_slot": {"morning": 2, "evening": 2},
    "neighborhoods": [
      {"id": "N1", "name": "Hillview (synthetic)", "demand_by_slot": {"morning": 1, "evening": 1},
       "priority_weight": 1.5, "storage_capacity_units": 2}
    ],
    "seed": 42
  },
  "settings": {"include_qaoa": true, "fairness_weight": 2.0, "p": 1, "shots": 1024, "maxiter": 25, "seed": 42}
}
```

Validation (HTTP 422 with a `problems` list naming each field):

* 1 to 3 unique slots; 1 to 6 neighborhoods with unique ids.
* Per-slot demand 0 or 1: each decision delivers one unit, so a larger value could never be served.
* At most 12 requested deliveries, so exact enumeration stays at 4,096 plans or fewer.
* Supply 0 to 20 per slot, storage 0 to 10, priority weight 0.1 to 10, fairness weight 0 to 20, penalty weight above 0 (default: derived by the engine).
* QAOA: p 1 to 3, shots 16 to 8,192, optimiser steps 1 to 200. Above 15 qubits (decisions plus slack) QAOA is not run and is returned with status `skipped` and the reason; greedy and exact still run.

## Solve response

Each entry of `results` has `key` (`greedy`, `exact`, `qaoa`), `status`
(`ok`, `error`, `skipped`), `error`, `allocation`, `objective_value`,
`feasible`, `metrics` (from `evaluate_allocation`), `runtime_seconds`,
`gap_to_exact`, the engine's `metadata`, and for QAOA the rebuilt `circuit`
(gate list, depth, counts, angles) and decoded `samples` (best and most
frequent bit strings). A failed or skipped solver has no allocation, score or
metrics. The response also echoes the scenario and effective settings (with
the penalty weight used), the model size, a `reference.deliver_nothing`
scored with the same metrics, the wall time and the engine versions.

Every response carries `Content-Security-Policy` (own scripts, styles and
fonts only; not on `/docs`), `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY` and `Referrer-Policy: no-referrer`. There is no CORS
configuration: the app and API share one origin. `POST /api/evaluate`
accepts at most 20 neighborhoods and 10 slots in `allocation`.

Concurrent solve requests are serialised; one that waits more than 30 s
returns 503 with an explanation.
