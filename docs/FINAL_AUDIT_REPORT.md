# WATERWEAVE final audit report

Audit of branch `integration/final-validation` after the React frontend,
FastAPI layer, guided presentation and live-data pipeline were merged in.
Date: 2026-10-11. Everything below was checked against the code and
commands run on this checkout; things not checked are listed as such.

## A. Executive summary

* **Readiness:** ready for independent review and for the hackathon
  demonstration, with the limitations in section M. The optimisation maths,
  the API and the presentation held up under independent re-implementation,
  hostile input and a navigation stress test.
* **Defects found and fixed: 18 confirmed** (none Critical, 2 High, 6
  Medium, 10 Low; section J). The most important were:
  1. The raw API called illustrative populations "BBMP Ward Census (Static)"
     dated 2011 (Medium; the UI had hidden it).
  2. The Lab page could show the previous scenario's model, or a QAOA
     circuit from another scenario with this scenario's labels (High, two
     findings, from the independent frontend reviewer).
  3. Open-Meteo turned a missing reading into "0 mm, observed now" (Medium).
  4. The QAOA result note claimed it "compares favorably in sampling
     diversity", which nothing measured (Medium).
* **Release blockers remaining:** none known. The unverified conditions in
  section M (real projector, other browsers, screen reader) are risks, not
  failures.
* **Not merged.** `main` is untouched.

## B. Repository and Git state

| Item | Value |
|---|---|
| Repository | `Zynx095/WATERWEAVE` (private) |
| Branch | `integration/final-validation` |
| Start of audit | `3576ff5` (merge of `claude/frontend-demo-mode` at `120e775` into `b4bda95`); 54 commits ahead of `origin/integration/final-validation`, not yet pushed; working tree clean |
| Frontend integration merge | `3576ff5`; its second parent `120e775` is the frontend branch tip |
| Audit commits | 16 (`git log 3576ff5..HEAD`, including this report), each a separate verified fix, test or doc change |
| `origin/main` | `b8cc20d`, unchanged. Not merged into, not modified |
| Other worktrees | listed with `git worktree list`; none were touched |
| History | no rebase, reset, amend or force-push |

## C. Architecture review

* **Engine** (`formulation.py`, `solvers.py`, `optimization.py`): QUBO with
  unary slack bits, converted to Ising; greedy (objective-aware with 1-opt),
  exact enumeration over eligible decisions, QAOA on Qiskit's statevector
  simulator with COBYLA. Unchanged by this audit apart from one result note.
* **API** (`src/waterweave/api/`): thin FastAPI layer. It computes no
  objective of its own (verified by reading `service.py`); one process
  serves API and built frontend; solves are serialised with a 30 s wait.
* **Frontend**: React 19, TypeScript, Vite, React Router; a store with
  request counters so superseded responses are ignored; a pure presentation
  reducer with step tokens; a recorded snapshot used only when the API is
  unreachable.
* **Data pipeline**: Open-Meteo (live, 5 min cache) and an illustrative
  population provider. The rainfall-to-supply heuristic is off by default
  (`ScenarioBuilder(apply_hypothetical_rainfall_heuristic=False)`), and no
  API path turns it on.

## D. Security audit

Scope: API validation and responses, static serving, presenter channel,
frontend injection and secrets, dependencies, Git contents.

| Check | Method | Result |
|---|---|---|
| Input validation | Pydantic schemas read; probe script with NaN, malformed JSON, unknown ids and slots, negative and 10^30 values, 300,000-entry allocation, zero supply, zero demand | All rejected with 422 or scored as invalid entries. One gap fixed: allocation size was unbounded (now 20 x 10) |
| Resource exhaustion | Worst case admitted by the schema: 15 qubits, p = 3, 8,192 shots, 200 iterations | 11 s end to end; bounded by validation limits |
| Path traversal | Encoded `..`, `%2e%2e`, drive paths against the static handler | Contained; regression test added |
| Error leakage | Read error paths; debug off | No tracebacks or paths. Provider and solver messages include the exception text (Low, accepted) |
| Headers | Inspected | None existed. Added CSP, nosniff, frame denial, no-referrer; CSP skipped for `/docs` only; Edge console clean at four viewports |
| CORS | Read | None configured, same origin only. No authentication: local single-user demo bound to 127.0.0.1 by default. `--host 0.0.0.0` exposes unauthenticated solver endpoints, which is the operator's choice |
| Presenter channel | `channel.ts`, reducer | BroadcastChannel is same-origin by construction; messages are whitelisted and type-checked, GOTO and pace re-validated in the reducer |
| Frontend | grep for `dangerouslySetInnerHTML`, `innerHTML`, `eval`, dynamic `href`, storage, env, keys | None found; no external requests, fonts bundled |
| Python dependencies | `pip-audit -r requirements.txt` (fresh venv) | No known vulnerabilities |
| npm dependencies | `npm audit` | 0 vulnerabilities (production and dev) |
| Secrets in PR diff | pattern scan of `origin/main...HEAD`; tracked-file check | None; no `.env`, databases, venvs or `node_modules` tracked |

Not done: dynamic scanning with a security tool, TLS and deployment
hardening (there is no deployment), dependency review of transitive Python
packages beyond what `pip-audit` resolves.

## E. Mathematical and scientific audit

* **Independent re-implementation.** A separate script rebuilt the objective
  from the problem statement without any engine helper and, on 40 random
  scenarios (1 to 4 neighborhoods, 0 to 3 supply and storage, fairness weights
  0 to 5), checked: exact solver value equals brute-force minimum over
  feasible plans; greedy is never better than exact; the QUBO energy,
  minimised over slack bits, equals the independent objective for every
  decision pattern; the Ising energy equals the QUBO energy on sampled
  states. 0 failures. The default scenario gives exact 6, greedy 7.
* **Formulation read-through:** fairness expansion
  `(m-1)/D^2`, `2(m-1)/D^2`, `-2/(D_i D_j)` is correct; slack counts cover
  every feasible slack value; the penalty derivation guarantees infeasible
  states exceed the best feasible one for the default penalty.
* **Edge cases run:** zero demand (all three solvers return score 0, QAOA
  with zero qubits), zero supply, supply above demand, storage 0.
* **Quantum claims:** every surface that mentions QAOA says simulated and no
  advantage (README, app footer, Compare page, presentation steps). Benchmark
  figures match `benchmark_results/*.json`: QAOA reaches the optimum in 14 of
  15 runs, random control 15 of 15, exact about 3.5 ms against QAOA 0.33 to
  0.73 s. Finding fixed: the README gave the approximation ratio as 1.00
  without saying it is the best run; the mean is about 1.011.
* **Selection rule, disclosed rather than changed:** QAOA's reported plan is
  the best feasible sampled bit string, chosen classically. The most frequent
  sample is reported beside it. This is stated in the app and the notes.
* **Fairness:** `fairness_score` is `1 - (max - min)` of served shares, so
  delivering nothing scores a perfect 1.0. The app shows delivered units and
  a "deliver nothing" reference beside it everywhere the score appears.
* **Greedy baseline** is the strong objective-aware version, not the naive
  priority rule, so the baseline is not weakened. The solver's display name
  still reads "Priority-First" (Informational; renaming would change a
  shared contract).

## F. Data-provenance audit

| Provider | Returns | Status label | Source timestamp | Finding |
|---|---|---|---|---|
| `open_meteo` | Current precipitation (mm) for Bengaluru | `VERIFIED_LIVE`, or `ERROR` observation with no value | Open-Meteo's own observation time | Missing precipitation became 0 mm and a missing time became the retrieval time. Fixed: both are now `ERROR` with no value |
| `bbmp_static` | Four hard-coded populations | `ILLUSTRATIVE` | none | Named itself "BBMP Ward Census (Static)", credited BBMP and opencity.in, dated 2011-03-01. Fixed at the source: name "Illustrative neighbourhood populations (not census data)", organisation "WATERWEAVE project assumption", no URL, no timestamp. Provider and dataset ids unchanged |

* The scenario description no longer says "real-world observations" and
  prints "Rainfall: not observed" instead of 0 mm when there is none.
* The offline snapshot was re-recorded from a clean tree so no 2011 or
  census label remains in `recordedRun.json` (0 matches).
* Regression tests: provider fields, raw `/api/data-sources` output, and
  the three incomplete-response shapes for Open-Meteo.
* Documentation (`DATA_SOURCES.md`, `DATA_MODEL.md`) now describes the
  populations as project assumptions.
* A crashed provider is returned with `failed: true` and shown as
  unavailable, not as "Not fetched yet".
* Rainfall is labelled context only everywhere; no reservoir, flow or
  neighborhood consumption values are invented or implied.

## G. Frontend and accessibility review

* Pages inspected in Edge at 1366x768, 1280x720, 820x1180 and 390x844:
  Overview, Workspace, Compare, Data, Lab, Presenter, 404. No horizontal
  overflow, no console errors or warnings, no failed requests.
* Keyboard: skip link, all pages reachable, presentation shortcuts, dialog
  focus (covered by Playwright).
* Forced colours: a Playwright test emulates Windows high contrast and
  checks the focus ring, current page and selected option.
* Automated: axe-core (WCAG 2.1 AA) on every page, narrow screens, the
  preflight dialog, bar and presenter view: no serious or critical issues.
* Findings fixed (independent reviewer): Compare labelled a failed exact
  solver "Optimal"; "followed the rules more often" and "passed independent
  checks" were unconditional; the lede called exact search faster than
  greedy; the benchmark footer hid that the engine tree was dirty; the QAOA
  panel called a rule-breaking plan "valid"; Cancel did nothing for runs
  started elsewhere; a live response could land after switching to the
  recorded run; the client dropped its timeout while a body streamed.
* **Not performed:** screen-reader testing, WCAG conformance claim,
  Firefox and Safari, real touch devices.

## H. Presentation-mode audit

* Nine steps play start to finish on the real engine (Playwright, 50 s at
  quick pace); pause, resume, next, previous, restart, exit, presenter
  window, failed solver with Retry, API down with recorded run all pass.
* Stress test: three rounds of mashing Right/Left/Home/Space/Escape while
  solver steps were in flight. All solves returned 200, no console errors,
  the app and engine were usable afterwards, the presenting flag cleared.
* Framing: at 1280x720 and 1366x768, the last sample of every step showed
  0 px of the highlighted target behind the caption bar.
* Captions and notes are built from computed values. Fixed: presenter notes
  said "computed live" for a recorded run; the data caption called a
  recorded snapshot an unavailable feed; step 1 used the selected scenario
  while the page showed the default; "cannot be met" ignored storage and
  now reads "at least".
* **Unverified:** a real projector or second physical screen, a presenter
  window on a different browser profile (the channel is same-browser by
  design), network loss in the middle of a live fetch on a real network.

## I. Test results (final code)

| Test/check | Command or method | Result | Evidence | Notes |
|---|---|---|---|---|
| Python | `python -m pytest -q` | 156 passed, 1 skipped | run after the last code change | skipped test is the optional live fetch |
| Frontend unit | `npx vitest run` in `frontend/` | 113 passed (18 files) | after the last code change | |
| Frontend build | `npm run build` (tsc + vite) | passes | run inside `npm run e2e` | |
| Browser | `PLAYWRIGHT_CHANNEL=msedge npm run e2e` | 22 passed, 1.7 min | against the real API on the final build | Edge only |
| Viewport sweep | scripted, 7 routes x 4 sizes | 0 overflow, 0 console issues | | with the security policy active |
| Presentation stress | scripted, 3 rounds | no errors | | |
| Independent maths | scripted, 40 scenarios | 0 failures | | not committed as a test; the maths is covered by existing tests and the benchmark audit |
| `npm audit` | | 0 vulnerabilities | | |
| `pip-audit` | `-r requirements.txt`, fresh venv | none known | | |
| Lint | project has no configured linter; `ruff` with default and strict rules on `src/waterweave/api` | clean for correctness rules | | older engine, data and UI files have style findings (unused imports, `datetime.UTC`); not changed |

## J. Findings register

| # | Sev | Where | Issue | Fixed | Commit | Test |
|---|---|---|---|---|---|---|
| 1 | Medium | `data/providers/bbmp_static.py` | Illustrative populations labelled as 2011 BBMP census, with BBMP and opencity.in credited | yes | bb6245f, e362044, f4701f6 | provider + API tests |
| 2 | Medium | `data/providers/open_meteo.py` | Missing precipitation read as 0 mm; missing time replaced by retrieval time | yes | 717c4a0 | 4 cases |
| 3 | Low | `data/scenario_builder.py` | Description claimed "real-world observations" and "0.0mm" | yes | 7babed3 | yes |
| 4 | Medium | `solvers.py` metadata note | Unsupported "compares favorably in sampling diversity" | yes | 7d22500, 3dc509a | yes |
| 5 | Low | `api/app.py` | No security headers | yes | 7e30190, de16231 | yes |
| 6 | Low | `api/schemas.py` | Evaluate allocation unbounded | yes | 64c99d8 | yes |
| 7 | High | `LabPage.tsx`, `store.tsx` | Previous model shown after a failed model request | yes | 0967c1d | reducer test |
| 8 | High | `LabPage.tsx` | QAOA circuit from another scenario drawn with this scenario's labels | yes | 0967c1d | page test |
| 9 | Medium | `WorkspacePage.tsx`, `store.tsx` | Cancel only worked for runs from that page instance | yes | 0967c1d | build + e2e |
| 10 | Medium | `ComparePage.tsx` | Failed exact solver labelled "Optimal"; unconditional claims; "fastest" lede | yes | a26d8ac | build |
| 11 | Medium | `steps.ts` | Presenter told a recorded run is live | yes | c5b388a | steps.test.ts |
| 12 | Low | `ComparePage.tsx` | Benchmark footer hid dirty engine tree and branch | yes | a26d8ac | build |
| 13 | Low | `store.tsx` | Live response could land in recorded mode | yes | 0967c1d | build |
| 14 | Low | `client.ts` | Timeout and cancel dropped while body streams | yes | 0967c1d | client tests |
| 15 | Low | `steps.ts` | Recorded data caption; intro step vs selected scenario; "cannot be met" ignoring storage | yes | c5b388a | yes |
| 16 | Low | `SolverPanel.tsx` | Rule-breaking QAOA plan called valid | yes | a26d8ac | build |
| 17 | Low | `service.py`, `DataPage.tsx` | Crashed provider shown as "Not fetched yet" | yes | 46fdfa3 | yes |
| 18 | Low | README | Approximation ratio 1.00 stated without "best run" | yes | 05848d0 | n/a |

Not fixed, by decision:

* Informational: solver display name "Greedy (Priority-First)" describes a
  stronger heuristic; it is a shared contract name.
* Low: error text of unexpected exceptions is returned to the client.
* Low: `HEAD /` returns 405 (GET only).
* Low: `penalty_weight` may be set tiny by a user, which unenforces the
  constraints; results are then reported infeasible, not hidden.
* Low: `lint` style findings in legacy files owned by other workstreams.

## K. Pull-request details

* Source `integration/final-validation`, target `main`.
* The PR contains the optimisation, validation, live-data and frontend
  workstreams, because none of them is on `main` yet. Open PRs #1
  (`claude/validation`) and #2 (`codex/optimization`) overlap with it.
* PR URL: <https://github.com/Zynx095/WATERWEAVE/pull/4> (open, not merged, no approvals).
* **The PR has not been merged and must not be merged until a reviewer has
  gone through the checklist in its description.**

## L. Collaborator-access cleanup

* `GET /repos/Zynx095/WATERWEAVE/collaborators` returned exactly one
  account: `Zynx095` (type User, role admin), the repository owner and the
  authenticated user. There are no pending invitations, deploy keys or
  webhooks.
* No account identifiable as Claude exists among the collaborators, so
  **nothing was removed**. Removing the only collaborator would have removed
  the owner, which the instructions forbid.
* Not inspectable with this token: GitHub App installations on the account
  or repository, OAuth app grants, personal access tokens, organisation or
  team permissions (the repository is user-owned, so teams do not apply).
  Review them at <https://github.com/settings/installations> and
  <https://github.com/settings/applications>.

## M. Final recommendations

1. Have a person other than the author go through the PR checklist and run
   the demo once on the presentation machine and projector, in the browser
   that will be used.
2. Rehearse the recorded fallback (`Start with the recorded run`) and the
   offline start (`python -m waterweave.api --offline`) so the failure path
   is familiar.
3. Decide whether to merge PRs #1 and #2 first or close them in favour of
   this one; they overlap.
4. Data workstream: replace the illustrative populations with a verified,
   dated source if one is ever ingested, and keep the label until then.
5. Optional hardening: Firefox and Safari checks, a screen-reader pass, and
   moving `isStale` out of `WorkspacePage.tsx` into `lib/`.
