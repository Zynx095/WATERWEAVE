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
crosses over and is dyed indigo; where a request went unmet, the crossing is
marked with a madder ring; where nothing was requested, the threads pass
plainly. Each crossing has a text label for screen readers, and the counts
("1 of 2") are printed beside every row.

| Token | Value | Use | Contrast on white |
|---|---|---|---|
| Paper | `#EEF2F1` | Page background (cool limewash, not cream) | |
| Sheet | `#FFFFFF` | Panels that group results | |
| Ink | `#13213C` | Text | 16.0:1 |
| Indigo | `#1F3FB4` | Delivered water, primary actions, exact solver | 8.7:1 |
| Madder | `#B3261E` | Unmet demand, errors | 6.5:1 |
| Ochre | `#8A5F00` text / `#F2CF6B` fill | QAOA | 5.7:1 (text) |
| Slate | `#526178` | Greedy solver | 6.2:1 |
| Verdigris | `#0B6B5E` | Verified live data | 6.4:1 |
| Spotlight | `#A87600` | Presentation outline around the current target | 3.5:1 on paper (non-text) |

Values and contrast ratios are kept in `frontend/src/styles/tokens.css`.
Each solver keeps its dye everywhere: panel thread, table row marker, score
bar and fairness bar.

Indigo, ochre and madder are natural dyes, which ties the palette to the
weave. Colour never carries meaning alone: every state also has an icon or
text.

Type: Barlow Condensed (headings and figures; modelled on public signage)
and Atkinson Hyperlegible Next (body; designed for legibility, which matters
on a projector). Body 18 px, scale ratio 1.25, tabular figures for numbers.

Motion: one moment only. When a result arrives, its weave threads draw in
(600 ms). Everything respects `prefers-reduced-motion`.

Accessibility beyond the palette:

* Keyboard: a skip link, visible focus on every control, and every page and
  presentation control reachable without a mouse.
* Windows high contrast (forced colours): focus rings, the selected option,
  the current page and presentation progress have forced-colour styles in
  `forced-colors.css`, since forced colours drop the box shadows and fills
  those cues use otherwise.
* Narrow screens: wide tables say that they scroll sideways and keep their
  first column pinned; the circuit keeps its qubit names in view.
* Every scrollable region is labelled and focusable, so it can be scrolled
  from the keyboard.

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
* Framing: each step's element is centred in the space above the caption
  bar, or shown from its top if it is taller. Halfway through a step that is
  playing on its own, a taller element is scrolled on until its end sits
  above the bar, once per step entry; paused or manual presenters are never
  scrolled under. Measured at 1280x720: nothing of a step's element stays
  behind the bar by 80% of the step.

Steps (about four minutes at the default pace): problem, scenario,
constraints, classical solvers (live run), QAOA (live run), results and
fairness, data integrity (live fetch or offline fallback), honest
comparison, conclusion.

Audience view: the real app with a caption bar (step, progress, controls); a
clean view (H) hides navigation and controls for two-screen setups.
Presenter view: `/presenter` in a second window, synchronised over
`BroadcastChannel`, with notes, next step, timers and controls. Keys: Space
pause/resume, Right or Page Down next, Left or Page Up previous, Home
restart, Esc exit, N notes, H clean view.

Preflight before starting checks the backend, the solver engine and Qiskit
(a real p=1 run), live data (optional) and the recorded fallback. If the
backend is down, the presenter can run the walkthrough on a recorded run
captured by `scripts/export_demo_snapshot.py`; every result it shows is
labelled "recorded".

## 6. Verification

| Suite | Command | Result on this branch |
|---|---|---|
| Python | `pytest` | 142 passed, 1 skipped (optional live fetch). The original 104 still pass; `tests/test_api.py` covers every endpoint, validation, failure reporting and offline mode; `tests/test_recorded_snapshot.py` replays the recorded run against the engine. |
| Frontend | `cd frontend && npm test` | 108 passed: state machine transitions, the controller with fake timers (auto-advance, pause, resume, keys, failures, timer cleanup), preflight, presenter channel, API client, weave, editor validation, pages, and the browser-side service shares checked against the engine's fairness numbers. |
| Browser | `cd frontend && npm run e2e` | 22 passed in Microsoft Edge against the real API (1.7 min): all pages, real solver runs, failure and offline paths, three viewport sizes, keyboard use, forced colours, the full nine-step presentation playing on its own, the presenter window, and an axe-core WCAG 2.1 AA audit with no serious or critical violations. |

Clean setup, 2026-10-11: a fresh clone of the pushed branch (at
`8edcb0d`) followed the README in a new virtual environment
(`pip install -r requirements.txt`, `pip install -e .`, `npm ci`,
`npm run build`). `pytest` gave 142 passed and 1 skipped, Vitest passed,
and `python -m waterweave.api` served the app and answered a default
solve with greedy 7, exact 6 and QAOA 6. Commits after `8edcb0d` change
only frontend code and were checked in the development worktree.

The brief's twenty browser checks and the tests that cover them
(`frontend/e2e/`):

| # | Check | Covered by |
|---|---|---|
| 1 | Launch from the documented command | Playwright's web server runs `python -m waterweave.api`, which serves the API and the built app |
| 2 | Open the overview | `app.spec.ts`: overview explains the problem with numbers from the engine |
| 3 | Navigate to the workspace | `app.spec.ts`: workspace edits the scenario and runs the real solvers |
| 4 | Configure or load a scenario | same test: preset, a toggled request, reset; typed input is validated |
| 5 | Run the solvers | same test, on the real engine |
| 6 | Results appear | same test: exact score 6, QAOA circuit facts, fairness table |
| 7 | Compare classical and quantum | `app.spec.ts`: comparison runs all three solvers and shows the recorded benchmark |
| 8 | Inspect data provenance | `app.spec.ts`: data sources label each input |
| 9 | Start presentation mode | `presentation.spec.ts`: every test starts through the preflight dialog |
| 10 | Automatic progression | `presentation.spec.ts`: plays every step on its own with real results, then finishes |
| 11 | Pause stops progression | `presentation.spec.ts`: pause, wait longer than a step, still on the same step |
| 12 | Resume continues | same test |
| 13 | Back and forward | same test: buttons and arrow keys |
| 14 | Restart | same test |
| 15 | Exit | `presentation.spec.ts`: exit restores normal use; the presenter window can exit too |
| 16 | Offline or failed live data | `app.spec.ts`: failed weather fetch, API down with the recorded run; `presentation.spec.ts`: walkthrough on the recorded run without the API, failing solver step with Retry |
| 17 | Console errors and failed requests | every test fails on an unexpected console error, page error or failed request (`e2e/fixtures.ts`) |
| 18 | Responsive layouts | `app.spec.ts`: laptop 1366x768, tablet 820x1180 and phone 390x844, no sideways page scroll |
| 19 | Important controls stay usable | the same viewport tests click the run button, the menu and the presentation controls; keyboard and forced-colours tests |
| 20 | Valid state after the presentation | `presentation.spec.ts`: after exit the solvers run and navigation works |

Playwright's own browser download was blocked on the development machine,
so the browser tests ran with `PLAYWRIGHT_CHANNEL=msedge` (the installed
Edge). On a machine where `npx playwright install chromium` works, the
default bundled Chromium is used.
