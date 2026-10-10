"""Tests for the HTTP API used by the web frontend (src/waterweave/api).

Expected numbers are the hand-checked values for the synthetic default
scenario documented in docs/VALIDATION.md: exact optimum 6.0, objective-aware
greedy 7.0, "deliver nothing" 10.0 with fairness score 1.0.
"""

import copy
import json

import pytest

pytest.importorskip("fastapi")
try:  # Starlette's test client needs httpx2 (or the older httpx)
    from fastapi.testclient import TestClient
except (ImportError, RuntimeError) as exc:  # pragma: no cover - depends on environment
    pytest.skip(f"FastAPI TestClient unavailable: {exc}", allow_module_level=True)

from waterweave.api import service
from waterweave.api.app import create_app
from waterweave.scenarios import default_scenario


@pytest.fixture(scope="module")
def client():
    return TestClient(create_app())


@pytest.fixture
def default_payload():
    return service.scenario_to_dict(default_scenario())


def _by_key(body):
    return {r["key"]: r for r in body["results"]}


# ---- health and presets ---------------------------------------------------

def test_health_reports_engine_versions(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["engine"]["qiskit"]
    assert body["engine"]["max_qaoa_qubits"] == service.MAX_QAOA_QUBITS


def test_default_preset_is_the_shared_synthetic_scenario(client):
    presets = {p["id"]: p for p in client.get("/api/presets").json()}
    assert presets["default"]["scenario"] == service.scenario_to_dict(default_scenario())
    assert presets["default"]["provenance"] == "synthetic"
    assert "SYNTHETIC" in presets["default"]["scenario"]["description"]


def test_presets_vary_only_what_they_say(client):
    presets = {p["id"]: p["scenario"] for p in client.get("/api/presets").json()}
    assert presets["drought"]["supply_by_slot"] == {"morning": 1, "evening": 1}
    assert presets["ample"]["supply_by_slot"] == {"morning": 4, "evening": 3}
    lakeside = {n["id"]: n["priority_weight"] for n in presets["lakeside-priority"]["neighborhoods"]}
    assert lakeside == {"N1": 1.5, "N2": 1.0, "N3": 1.0, "N4": 3.0}
    # Illustrative population / 25,000, rounded to 2 places by ScenarioBuilder.
    illus = {n["id"]: n["priority_weight"] for n in presets["illustrative-population"]["neighborhoods"]}
    assert illus == {"N1": 1.4, "N2": 1.68, "N3": 1.12, "N4": 2.04}
    assert presets["illustrative-population"]["supply_by_slot"] == {"morning": 2, "evening": 2}


# ---- solving --------------------------------------------------------------

def test_classical_solve_matches_documented_values(client, default_payload):
    body = client.post(
        "/api/solve", json={"scenario": default_payload, "settings": {"include_qaoa": False}}
    ).json()
    res = _by_key(body)
    assert set(res) == {"greedy", "exact"}
    assert res["exact"]["objective_value"] == pytest.approx(6.0)
    assert res["exact"]["feasible"] is True
    assert res["greedy"]["objective_value"] == pytest.approx(7.0)
    assert res["greedy"]["gap_to_exact"] == pytest.approx(1.0)
    assert res["exact"]["metrics"]["fairness_score"] == pytest.approx(0.5)
    nothing = body["reference"]["deliver_nothing"]
    assert nothing["objective_value"] == pytest.approx(10.0)
    assert nothing["metrics"]["fairness_score"] == pytest.approx(1.0)
    assert body["model"]["n_decision"] == 7 and body["model"]["n_slack"] == 5
    assert body["settings"]["penalty_weight"] == pytest.approx(15.0)
    assert body["source"] == "live"


def test_qaoa_solve_returns_real_telemetry_and_circuit(client, default_payload):
    body = client.post(
        "/api/solve",
        json={"scenario": default_payload, "settings": {"include_qaoa": True, "p": 1, "seed": 7}},
    ).json()
    q = _by_key(body)["qaoa"]
    assert q["status"] == "ok"
    md = q["metadata"]
    assert md["solver_type"] == "quantum_approximate"
    assert md["num_qubits"] == 12 and md["layers_p"] == 1 and md["shots"] == 1024 and md["seed"] == 7
    assert md["quantum_advantage_claimed"] is False
    # The circuit is rebuilt from the reported angles: same size as reported.
    assert q["circuit"]["num_qubits"] == 12
    assert q["circuit"]["depth"] == md["circuit_depth"]
    assert len(q["circuit"]["gates"]) == sum(q["circuit"]["gate_counts"].values())
    # QAOA can match but never beat the exact optimum on the same objective.
    assert q["objective_value"] >= 6.0 - 1e-9
    best = q["samples"]["best"]
    assert best["bitstring"] == md["best_bitstring"]
    assert len(best["decision_bits"]) == 7 and len(best["slack_bits"]) == 5
    assert best["allocation"] == q["allocation"]


def test_qaoa_failure_is_reported_not_replaced(client, default_payload, monkeypatch):
    from waterweave import solvers

    monkeypatch.setattr(solvers, "HAS_QISKIT", False)
    body = client.post("/api/solve", json={"scenario": default_payload}).json()
    res = _by_key(body)
    assert res["qaoa"]["status"] == "error"
    assert "Qiskit is not installed" in res["qaoa"]["error"]
    assert res["qaoa"]["allocation"] is None and res["qaoa"]["objective_value"] is None
    assert res["qaoa"]["metrics"] is None
    # Classical results are unaffected and still the engine's own.
    assert res["exact"]["status"] == "ok" and res["exact"]["objective_value"] == pytest.approx(6.0)


def test_qaoa_over_qubit_budget_is_skipped_with_reason(client, default_payload):
    big = copy.deepcopy(default_payload)
    for n in big["neighborhoods"]:
        n["demand_by_slot"] = {"morning": 1, "evening": 1}
        n["storage_capacity_units"] = 1
    big["supply_by_slot"] = {"morning": 3, "evening": 3}
    body = client.post("/api/solve", json={"scenario": big}).json()
    res = _by_key(body)
    assert body["model"]["n_vars"] > service.MAX_QAOA_QUBITS
    assert res["qaoa"]["status"] == "skipped"
    assert "qubits" in res["qaoa"]["error"]
    assert res["exact"]["status"] == "ok" and res["greedy"]["status"] == "ok"


@pytest.mark.parametrize(
    "mutate, field",
    [
        (lambda s: s["neighborhoods"][0]["demand_by_slot"].update(morning=2), "neighborhoods.0.demand_by_slot"),
        (lambda s: s["neighborhoods"][1].update(id="N1"), "scenario"),
        (lambda s: s["supply_by_slot"].update(morning=-1), "scenario"),
        (lambda s: s["supply_by_slot"].update(noon=1), "scenario"),
        (lambda s: s["neighborhoods"][0].update(priority_weight=0), "neighborhoods.0.priority_weight"),
        (lambda s: s["neighborhoods"][0]["demand_by_slot"].update(noon=1), "scenario"),
        (lambda s: s.update(slots=["morning", "morning"]), "scenario.slots"),
    ],
)
def test_invalid_scenarios_are_rejected_with_reasons(client, default_payload, mutate, field):
    mutate(default_payload)
    resp = client.post("/api/solve", json={"scenario": default_payload})
    assert resp.status_code == 422
    body = resp.json()
    assert body["problems"]
    assert any(field in p["field"] for p in body["problems"]), body["problems"]


@pytest.mark.parametrize("settings", [{"p": 4}, {"shots": 0}, {"fairness_weight": -1}, {"bogus": 1}])
def test_invalid_settings_are_rejected(client, default_payload, settings):
    resp = client.post("/api/solve", json={"scenario": default_payload, "settings": settings})
    assert resp.status_code == 422


def test_unknown_api_route_is_json_404(client):
    resp = client.get("/api/nope")
    assert resp.status_code == 404
    assert "Unknown API route" in resp.json()["detail"]


def test_busy_solver_returns_503(client, default_payload, monkeypatch):
    monkeypatch.setattr(service, "_SOLVE_LOCK", _AlwaysBusy())
    resp = client.post("/api/solve", json={"scenario": default_payload, "settings": {"include_qaoa": False}})
    assert resp.status_code == 503
    assert "in progress" in resp.json()["detail"]


class _AlwaysBusy:
    def acquire(self, timeout=None):
        return False

    def release(self):  # pragma: no cover - never acquired
        raise AssertionError("not acquired")


def test_json_safe_handles_non_finite_and_numpy():
    import numpy as np

    out = service.json_safe({"a": float("inf"), "b": np.float64(1.5), "c": (np.int64(2), np.bool_(True))})
    assert out == {"a": None, "b": 1.5, "c": [2, True]}
    json.dumps(out)
