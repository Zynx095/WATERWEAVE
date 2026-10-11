# Running WATERWEAVE on Windows (PowerShell)

This guide covers a Windows 10 or 11 machine with PowerShell. The app is one
process: `python -m waterweave.api` serves both the API and the built web
app, so you open one URL and need one terminal. Commands were checked on
Windows 11 with Python 3.12, Node.js 26 and Microsoft Edge; anything not
confirmed is marked *unverified*.

## 1. Prerequisites

| Tool | Needed | Check |
|---|---|---|
| Python | 3.11 or newer (`requires-python` in `pyproject.toml`; 3.12 tested) | `python --version` |
| Node.js | 22.12 or newer (`engines` in `frontend/package.json`) | `node --version` |
| npm | comes with Node.js | `npm --version` |
| Git | any recent version | `git --version` |
| Microsoft Edge or Chrome | only for the browser tests | |

Python packages are pinned loosely in `requirements.txt`
(`qiskit~=2.5.2`, `fastapi>=0.115`, `uvicorn>=0.30`, NumPy, SciPy, plus
Streamlit, Plotly, Pandas and Jupyter for the older dashboard and
notebooks). The first install downloads a lot and can take several minutes.

Install Python from <https://www.python.org/downloads/windows/> (tick *Add
python.exe to PATH*) and Node.js LTS from <https://nodejs.org/>. Open a new
PowerShell window afterwards so that PATH is refreshed.

## 2. Open the repository and check it

```powershell
cd "D:\College\SOMESHIT DOWNLOADS\WATERWEAVE-Integration"
git branch --show-current     # integration/final-validation
git log --oneline -1          # the latest commit
git status --short            # no output means a clean working tree
```

Keep the quotes: the folder name contains spaces.

## 3. Python environment

A virtual environment keeps WATERWEAVE's packages separate from the others on
your machine (recommended, because a global Python can have an older
`waterweave` installed from another folder).

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install -e .
```

The prompt shows `(.venv)` once it is active. Check it:

```powershell
python -c "import waterweave, qiskit; print(waterweave.__file__); print(qiskit.__version__)"
python -m waterweave.api --help
```

Expected: a path inside this repository's `src\waterweave`, `2.5.2` (any
2.5.x), and the usage text with `--host`, `--port` and `--offline`.

If activation is blocked ("running scripts is disabled"), you do not need to
change any policy: call the environment's interpreter directly instead and
use it for every command in this guide:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pip install -e .
.\.venv\Scripts\python.exe -m waterweave.api
```

## 4. Build the web app

```powershell
cd frontend
npm ci
npm run build
npm test
cd ..
```

* `npm ci` installs exactly what `package-lock.json` lists (about 115
  packages). Do not delete the lock file.
* `npm run build` type-checks and writes `frontend\dist`. It ends with
  `built in ...`.
* `npm test` runs the Vitest suite; it should end with all test files and
  tests passed.

## 5. Start WATERWEAVE

```powershell
python -m waterweave.api
```

Expected output includes `WATERWEAVE: open http://127.0.0.1:8000/` and
`Uvicorn running on http://127.0.0.1:8000`. Leave this window open and browse
to <http://127.0.0.1:8000>. Stop it with `Ctrl+C`.

Quick check from a second PowerShell window:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
```

Expected: `status` is `ok`, `frontend_built` is `True`, and the engine
versions are listed. If `frontend_built` is `False`, repeat section 4.

Options: `--port 8080`, `--host 0.0.0.0` (exposes the unauthenticated API to
your network; avoid on shared networks) and `--offline`.

## 6. Walk through the app

1. **Overview:** a headline with the number of requests and the supply, a
   weave diagram and the main findings.
2. **Workspace:** the scenario editor. Click a crossing to add or remove a
   request.
3. **Run greedy and exact:** switch QAOA off in the settings, press *Run
   greedy and exact*. Each result card shows its plan, score (lower is
   better) and runtime.
4. **QAOA:** switch QAOA on and run again. The card shows the simulated
   qubit count, circuit depth and how many samples followed the rules. It is
   a simulation on your computer, not quantum hardware.
5. **Classical vs quantum:** the same three solvers on one scoring, the gap
   to the exact optimum, and the recorded benchmark with a random-sampling
   control.
6. **Data sources:** each input is labelled live, cached, illustrative,
   synthetic or unavailable. Population figures are illustrative, not census
   records.
7. **Quantum lab:** the model, couplings and the circuit QAOA actually ran.
   Press *Run QAOA on this scenario* if it asks.

## 7. Guided presentation

Press **Present** in the header. The checklist runs the engine once and
checks live weather; then choose **Start with the live engine**. Nine steps
play on their own (about four minutes at standard pace; the dialog also
offers a quick one-minute pace).

| Action | Key |
|---|---|
| Pause or resume | Space or K |
| Next or previous step | Right/Left arrows, Page Down/Up |
| Restart | Home |
| Presenter notes | N |
| Clean audience view | H |
| Exit | Esc |

Presenter view: choose *Open presenter view* in the dialog, or open
<http://127.0.0.1:8000/presenter> in another window **of the same browser**.
It shows notes and large controls and follows the main window.

Recorded fallback: if the API is not running, the app says so and offers
*Show recorded run* / *Start with the recorded run*. Everything it then shows
is labelled "Recorded run" and only covers the default scenario with default
settings.

## 8. Offline mode

```powershell
python -m waterweave.api --offline
```

Equivalent: set `$env:WATERWEAVE_OFFLINE = "1"` before starting. The server
never contacts Open-Meteo. The solvers, quantum lab, benchmark and
presentation all work, because they run locally. The weather row on the data
page says it was not fetched; demand, supply and storage are synthetic and
populations illustrative either way.

## 9. Tests

```powershell
pytest                              # Python (from the repository root)
cd frontend
npm test                            # Vitest
$env:PLAYWRIGHT_CHANNEL = "msedge"  # use installed Edge; use "chrome" for Chrome
$env:WATERWEAVE_PYTHON = (Resolve-Path ..\.venv\Scripts\python.exe).Path
npm run e2e                         # builds, starts the API on port 8799, drives a browser
```

Expected: pytest ends with `passed` (plus one skipped optional live-fetch
test); Vitest reports all files passed; Playwright reports all tests passed.
Playwright's own browser download can be blocked on some networks; the
`PLAYWRIGHT_CHANNEL` line avoids it. `npx playwright install chromium` is
the alternative (*unverified* on this machine because it was blocked).

## 10. Troubleshooting

| Symptom | Diagnose | Fix |
|---|---|---|
| `python` is not recognised | `Get-Command python`, `py -0p` | Install Python with *Add to PATH*, or use `py -3.12 -m venv .venv` |
| Python older than 3.11 | `python --version` | Install 3.11 or 3.12 and recreate `.venv` with that interpreter |
| `Activate.ps1` cannot be loaded | the error names the script policy | Use `.\.venv\Scripts\python.exe` directly (section 3) |
| `ModuleNotFoundError: waterweave` | `python -c "import waterweave"` | Activate `.venv` and run `pip install -e .` from the repository root |
| Imports come from another folder | `python -c "import waterweave; print(waterweave.__file__)"` | Use the venv, then `pip install -e .` here |
| `pip install` fails building a package | read the last 20 lines | Upgrade pip; check you use Python 3.11 to 3.12; share the full error rather than trying random fixes |
| `node` or `npm` not recognised | `Get-Command node` | Install Node.js LTS and open a new PowerShell |
| Node older than 22.12 | `node --version` | Install a newer Node.js |
| `npm ci` fails | read the first error | Make sure you are inside `frontend`; check network or proxy; never delete `package-lock.json` |
| Page shows "WATERWEAVE API is running" only | the page says the frontend is not built | Run section 4, then restart the server |
| Port 8000 in use | `Get-NetTCPConnection -LocalPort 8000` | `python -m waterweave.api --port 8001` and open that port |
| "API is not reachable" in the browser | `Invoke-RestMethod http://127.0.0.1:8000/api/health` | Start the server, press Retry |
| QAOA says "Not run: needs N qubits" | | Limit is 15 qubits; reduce requests; greedy and exact still run |
| Presenter view does not follow | | Open both windows in the same browser profile |
| Playwright cannot download a browser | | Set `PLAYWRIGHT_CHANNEL` (section 9) |
| A path with spaces fails | | Wrap the path in double quotes |

Stop and share the full error text (not a screenshot of part of it), the
output of `python --version`, `node --version` and `git log --oneline -1`
if the same step fails twice.
