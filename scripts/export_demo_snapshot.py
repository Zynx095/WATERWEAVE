"""Record real API responses for the frontend's offline fallback.

    python scripts/export_demo_snapshot.py

Calls the WATERWEAVE API in-process (FastAPI TestClient, so requests go
through the same validation and serialisation as over HTTP) and writes the
raw responses to frontend/src/data/recordedRun.json together with the git
commit, time and library versions. The frontend uses this file only when the
API cannot be reached, and labels everything from it as a recorded run.

Nothing is edited after recording. tests/test_recorded_snapshot.py re-runs
the same requests and checks that the recording still matches the engine.
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "src" / "data" / "recordedRun.json"

# The requests the guided presentation makes, in order.
QUANTUM_SETTINGS = {"include_qaoa": True, "p": 1, "shots": 1024, "maxiter": 25, "seed": 42}
CLASSICAL_SETTINGS = {"include_qaoa": False}


def _git(*args: str) -> str:
    try:
        return subprocess.run(
            ["git", *args], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def record(client) -> dict:
    def ok(resp):
        if resp.status_code != 200:
            raise SystemExit(f"{resp.request.method} {resp.request.url} failed: {resp.status_code} {resp.text}")
        return resp.json()

    presets = ok(client.get("/api/presets"))
    default = next(p["scenario"] for p in presets if p["id"] == "default")
    return {
        "health": ok(client.get("/api/health")),
        "presets": presets,
        "solve_classical": ok(
            client.post("/api/solve", json={"scenario": default, "settings": CLASSICAL_SETTINGS})
        ),
        "solve_quantum": ok(
            client.post("/api/solve", json={"scenario": default, "settings": QUANTUM_SETTINGS})
        ),
        "model_default": ok(client.post("/api/model", json={"scenario": default})),
        "data_sources_offline": ok(client.get("/api/data-sources", params={"live": "false"})),
        "benchmark": ok(client.get("/api/benchmark")),
    }


def main() -> int:
    sys.path.insert(0, str(ROOT / "src"))
    from fastapi.testclient import TestClient

    from waterweave.api.app import create_app

    responses = record(TestClient(create_app()))
    snapshot = {
        "kind": "waterweave-recorded-run",
        "captured_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "git_commit": _git("rev-parse", "HEAD"),
        "git_dirty": bool(_git("status", "--porcelain", "--", "src")),
        "command": "python scripts/export_demo_snapshot.py",
        "note": (
            "Raw responses of the WATERWEAVE API for the synthetic default scenario. "
            "Shown by the frontend only when the API is unreachable, and labelled as recorded."
        ),
        "quantum_settings": QUANTUM_SETTINGS,
        "responses": responses,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(snapshot, indent=1) + "\n", encoding="utf-8")
    q = next(r for r in responses["solve_quantum"]["results"] if r["key"] == "qaoa")
    print(f"Wrote {OUT.relative_to(ROOT)} (commit {snapshot['git_commit'][:7]}, "
          f"QAOA objective {q['objective_value']}, status {q['status']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
