"""The frontend's recorded run must still match what the engine produces.

frontend/src/data/recordedRun.json is shown only when the API is unreachable.
These tests replay its requests against the current code. Greedy and exact
are deterministic and must match exactly. QAOA is deterministic for a fixed
seed on the same library versions; with other versions only its validity is
checked. Regenerate with: python scripts/export_demo_snapshot.py
"""

import importlib.util
import json
from pathlib import Path

import pytest

pytest.importorskip("fastapi")
try:
    from fastapi.testclient import TestClient
except (ImportError, RuntimeError) as exc:  # pragma: no cover - depends on environment
    pytest.skip(f"FastAPI TestClient unavailable: {exc}", allow_module_level=True)

from waterweave.api.app import create_app

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "frontend" / "src" / "data" / "recordedRun.json"

if not SNAPSHOT.is_file():  # pragma: no cover
    pytest.skip("no recorded snapshot", allow_module_level=True)

RECORDED = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
RESP = RECORDED["responses"]


@pytest.fixture(scope="module")
def fresh():
    spec = importlib.util.spec_from_file_location("export_snapshot", ROOT / "scripts" / "export_demo_snapshot.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.record(TestClient(create_app()))


def _results(payload):
    return {r["key"]: r for r in payload["results"]}


def test_snapshot_is_labelled_and_has_provenance():
    assert RECORDED["kind"] == "waterweave-recorded-run"
    assert len(RECORDED["git_commit"]) == 40
    assert RECORDED["captured_at"]
    assert "SYNTHETIC" in RESP["solve_quantum"]["scenario"]["description"]


def test_presets_and_model_match(fresh):
    assert fresh["presets"] == RESP["presets"]
    assert fresh["model_default"] == RESP["model_default"]


@pytest.mark.parametrize("name", ["solve_classical", "solve_quantum"])
def test_classical_results_match_exactly(fresh, name):
    now, then = _results(fresh[name]), _results(RESP[name])
    for key in ("greedy", "exact"):
        for field in ("status", "allocation", "objective_value", "feasible", "metrics", "gap_to_exact"):
            assert now[key][field] == then[key][field], (name, key, field)
    assert fresh[name]["reference"] == RESP[name]["reference"]


def test_quantum_result_matches_or_is_valid(fresh):
    now, then = _results(fresh["solve_quantum"])["qaoa"], _results(RESP["solve_quantum"])["qaoa"]
    assert now["status"] == then["status"] == "ok"
    same_versions = fresh["solve_quantum"]["engine"] == RESP["solve_quantum"]["engine"]
    if same_versions:
        for field in ("allocation", "objective_value", "feasible", "circuit"):
            assert now[field] == then[field], field
        for field in ("best_bitstring", "modal_bitstring", "feasible_samples_ratio", "optimal_gammas"):
            assert now["metadata"][field] == then["metadata"][field], field
    else:  # pragma: no cover - other library versions
        exact = _results(fresh["solve_quantum"])["exact"]["objective_value"]
        assert now["objective_value"] >= exact


def test_benchmark_matches_committed_files(fresh):
    assert fresh["benchmark"] == RESP["benchmark"]
