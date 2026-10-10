# Frontend architecture and presentation mode

Branch `claude/frontend-demo-mode`, started from `integration/final-validation`
at `b4bda9515d65c8345af5afdea7372222dc31a9b0` (verified against `origin` on
2026-10-10). This file records the audit, the architecture decision, the
design system and the presentation-mode design. Implementation details live
in the code; this is the map.

## 1. Audit of the starting point

| Area | State at `b4bda95` | Decision |
|---|---|---|
| Python tests | `pytest`: 104 passed, 1 skipped (optional live fetch), 12 s | Must stay green |
| Engine | `run_comparison` returns greedy, exact, QAOA `SolverResult`s; QAOA failures come back as `objective_value = inf` plus `metadata.error` | Call it, never re-implement it |
| Metrics | `evaluate_allocation` (fairness score = range, disparity = pairwise squares) | Single source for every number shown |
| Formulation | `build_model` gives decisions, slack bits, QUBO, Ising; `_build_qaoa_circuit` rebuilds the executed circuit from the reported angles | Used for the Quantum lab |
| Data | `registry.fetch_all()`: Open-Meteo rainfall (`VERIFIED_LIVE`, 5 min in-memory cache, `ERROR` observation on failure) and BBMP population (`ILLUSTRATIVE`, not census records). `ScenarioBuilder` keeps the rainfall-to-supply heuristic off | Show quality labels as-is; rainfall is context only |
| Dashboard | Streamlit `app.py`; works, but `ui/adapter.execute_solvers` replaces a failed engine run with demo results labelled `is_demo` | Keep untouched; the new API never substitutes results |
| README | Template headings broken: an extra `## 4. Live Municipal Data Integration` pushed "Implementation Walkthrough & Live Demo" to `## 5.`, so there are two section 5s | Restore the required headings, move live-data text under section 4 |

Measured solver latency on this machine (Python 3.12, Qiskit 2.5.2):
QAOA p=1 takes 0.45 s at 12 qubits, 1.4 to 1.9 s at 14, 3.9 s at 15, and
more than a minute at 18. The API therefore refuses QAOA above 15 qubits
with an explanation; greedy and exact still run.

## 2. Architecture

```
browser (React, TypeScript, Vite)
   |  fetch /api/*  (JSON, validated on both sides)
FastAPI  (src/waterweave/api)  -- thin layer, no maths of its own
   |  run_comparison, evaluate_allocation, evaluate_objective,
   |  build_model, _build_qaoa_circuit, registry, ScenarioBuilder
existing engine and data pipeline (unchanged)
```

* One process for presenting: `python -m waterweave.api` serves the API and
  the built frontend on one port. `npm run dev` proxies `/api` for
  development.
* Every number on screen comes from the API, which calls the engine. The
  frontend does layout and formatting only.
* A failed QAOA run is reported as failed. The recorded run (section 5) is
  used only when the backend cannot be reached, and is labelled as recorded.

Library choices:

| Need | Choice | Why |
|---|---|---|
| UI framework | React 19 + TypeScript + Vite 8 | Requested stack; fast dev server and build |
| Routing | React Router 7 | The presentation navigates real routes |
| Components | Native HTML (`dialog`, `details`, `input type=range`) with own CSS | Material UI was evaluated and not adopted: its Material look works against a distinctive identity, it adds roughly 90 kB gzipped plus Emotion, and the app needs only a handful of primitives that native elements provide accessibly |
| Icons | `lucide-react` | Tree-shaken, ISC licence |
| Charts | Hand-written SVG | Four neighborhoods, two slots and three solvers do not need a chart library; each chart has a table equivalent |
| Fonts | `@fontsource` packages, bundled | Works offline on stage |
| Tests | Vitest + Testing Library; Playwright | Unit, component and browser coverage |

React Bits was considered for effects and not used: nothing in the brief
needs decorative motion.

## 3. Information architecture

| Route | Answers |
|---|---|
| `/` Overview | What is it, why is allocation hard, how it decides, what was found |
| `/workspace` | Edit the scenario, run the solvers, read allocations, shortage and fairness |
| `/compare` | Classical and quantum on the same scenario and objective, plus the recorded multi-seed benchmark and what it does and does not show |
| `/data` | Which inputs are live, cached, illustrative, synthetic or unavailable |
| `/lab` | Decisions, objective, constraints, QUBO, slack, Ising, circuit, sampling, benchmark method; plain language first, maths behind disclosure |
| `/presenter` | Presenter view for a second window |

## 4. Design system

Subject: rationing scarce municipal water between neighborhoods and two
delivery slots, and testing whether a simulated quantum optimiser helps.
Audience: hackathon judges with mixed backgrounds, watching live or on video.

Signature element, used sparingly: **the weave**. An allocation is drawn as
woven threads: each neighborhood is a horizontal warp thread, each delivery
slot a vertical weft thread. Where a unit is delivered, the slot thread
crosses over and is dyed indigo; where demand is unmet, the crossing is left
open; where nothing was requested, the threads pass plainly. The same matrix
is always available as a table.

| Token | Value | Use |
|---|---|---|
| Paper | `#EEF2F1` | Page background (cool limewash, not cream) |
| Sheet | `#FFFFFF` | Panels that group results |
| Ink | `#13213C` | Text |
| Indigo | `#1F3FB4` | Delivered water, primary actions, exact solver |
| Madder | `#B3261E` | Unmet demand, errors |
| Ochre | `#9A6B00` text / `#F2CF6B` fill | QAOA, presentation spotlight |
| Slate | `#5B6B82` | Greedy solver, secondary text |
| Verdigris | `#0F7B6C` | Verified live data |

Indigo, ochre and madder are natural dyes, which ties the palette to the
weave. Colour never carries meaning alone: every state also has an icon or
text.

Type: Barlow Condensed (headings and figures; modelled on public signage)
and Atkinson Hyperlegible Next (body; designed for legibility, which matters
on a projector). Body 18 px, scale ratio 1.25, tabular figures for numbers.

Motion: one moment only. When a result arrives, its weave threads draw in
(600 ms). Everything respects `prefers-reduced-motion`.

## 5. Presentation mode

A pure reducer (`frontend/src/presentation/machine.ts`) owns the state:
`idle | running | paused | finished`, the step index, elapsed time in the
step, the pace, and a step token. Timers only dispatch `TICK` events; every
transition is unit-tested without timers.

* Pause stops the clock at once. Resume continues from the same elapsed time.
* Next and Previous work while running or paused and reset the step clock.
* Each step entry gets a new token. Async results (solver runs, data fetch)
  carry the token and are ignored if the presenter has moved on; the request
  is also aborted.
* A step with a pending action does not auto-advance until the action
  succeeds or fails. A failure pauses the walkthrough and shows the reason
  with a Retry button; Next still works.
* Exit returns to normal navigation on the current page.

Steps (about four minutes at the default pace): problem, scenario,
constraints, classical solvers (live run), QAOA (live run), results and
fairness, data integrity (live fetch or offline fallback), honest
comparison, conclusion.

Audience view: the real app with a caption bar (step, progress, controls).
Presenter view: `/presenter` in a second window, synchronised over
`BroadcastChannel`, with notes, next step, timers and controls. Keys: Space
pause/resume, Right or Page Down next, Left or Page Up previous, Home
restart, Esc exit, N notes.

Preflight before starting checks the backend, the solver engine and Qiskit
(a real p=1 run), live data (optional) and the recorded fallback. If the
backend is down, the presenter can run the walkthrough on a recorded run
captured by `scripts/export_demo_snapshot.py`; every result it shows is
labelled "recorded".

## 6. Verification plan

* `pytest`: existing suite plus `tests/test_api.py`.
* `npm test` (Vitest): reducer, clock, API client, weave, workspace
  validation, result and error rendering, provenance labels, presentation
  controls, channel protocol.
* `npm run e2e` (Playwright): the full browser walkthrough against the real
  backend, including the presentation, failure paths, console errors and
  three viewport sizes.
