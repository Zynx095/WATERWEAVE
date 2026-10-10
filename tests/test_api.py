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


# ---- model, circuit structure and scoring ----------------------------------

def test_model_endpoint_describes_qubo_ising_and_circuit(client, default_payload):
    body = client.post("/api/model", json={"scenario": default_payload}).json()
    assert (body["n_decision"], body["n_slack"], body["n_vars"]) == (7, 5, 12)
    assert [v["name"] for v in body["decision_vars"]][:2] == ["x_N1_morning", "x_N1_evening"]
    assert body["penalty_weight"] == pytest.approx(15.0)
    assert len(body["qubo"]["linear"]) == 12 and len(body["ising"]["h"]) == 12
    # Documented in QUANTUM_METHOD.md section 4: largest |h| = 22, largest |J| = 8.25.
    assert max(abs(h) for h in body["ising"]["h"]) == pytest.approx(22.0)
    assert max(abs(j[2]) for j in body["ising"]["J"]) == pytest.approx(8.25)
    depths = {c["p"]: c["depth"] for c in body["circuit_structure"]}
    assert depths == {1: 17, 2: 29, 3: 41}
    assert body["qaoa_within_budget"] is True


def test_model_ising_reproduces_qubo_energy(client, default_payload):
    """Spot-check the returned coefficients: H(z) equals the QUBO energy."""
    body = client.post("/api/model", json={"scenario": default_payload}).json()
    n = body["n_vars"]
    for state in (0, 1, 0b101101100101, 2**n - 1):
        z = [(state >> k) & 1 for k in range(n)]
        qubo = body["qubo"]["offset"] + sum(c * zk for c, zk in zip(body["qubo"]["linear"], z))
        qubo += sum(v * z[k] * z[l] for k, l, v in body["qubo"]["quadratic"])
        spins = [1 - 2 * zk for zk in z]  # z = (1 - Z) / 2
        ising = body["ising"]["offset"] + sum(h * s for h, s in zip(body["ising"]["h"], spins))
        ising += sum(v * spins[k] * spins[l] for k, l, v in body["ising"]["J"])
        assert ising == pytest.approx(qubo)


def test_evaluate_scores_any_allocation_with_shared_metrics(client, default_payload):
    optimum = {"N1": {"morning": 0, "evening": 1}, "N2": {"morning": 0, "evening": 1},
               "N3": {"morning": 1, "evening": 0}, "N4": {"morning": 1, "evening": 0}}
    body = client.post("/api/evaluate", json={"scenario": default_payload, "allocation": optimum}).json()
    assert body["objective_value"] == pytest.approx(6.0)
    assert body["metrics"]["feasible"] == 1.0
    # Riverside both slots: storage 2 > 1 -> infeasible, penalised by P = 15.
    over = {"N2": {"morning": 1, "evening": 1}}
    body = client.post("/api/evaluate", json={"scenario": default_payload, "allocation": over}).json()
    assert body["metrics"]["feasible"] == 0.0
    assert body["metrics"]["storage_violation_units"] == 1.0
    assert body["objective_value"] == pytest.approx(29.0)


# ---- data provenance --------------------------------------------------------

class _FakeResponse:
    def __init__(self, payload):
        self._data = json.dumps(payload).encode("utf-8")

    def read(self):
        return self._data

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.fixture
def fresh_cache():
    from waterweave.data import clear_cache

    clear_cache()
    yield
    clear_cache()


def _no_network(*args, **kwargs):
    raise AssertionError("offline request must not touch the network")


def _rain(body):
    return next(o for o in body["observations"] if o["provider"]["id"] == "open_meteo")


def test_offline_data_sources_skip_network_and_label_illustrative(client, monkeypatch, fresh_cache):
    monkeypatch.setattr("urllib.request.urlopen", _no_network)
    body = client.get("/api/data-sources", params={"live": "false"}).json()
    assert [s["provider"]["id"] for s in body["skipped"]] == ["open_meteo"]
    assert {o["quality"]["status"] for o in body["observations"]} == {"ILLUSTRATIVE"}
    assert len(body["observations"]) == 4
    effect = body["scenario_effect"]
    assert effect["rainfall_heuristic_enabled"] is False
    assert effect["supply_changed"] is False
    assert {c["id"] for c in effect["priority_weight_changes"]} == {"N1", "N2", "N3", "N4"}


def test_offline_mode_env_overrides_live_request(client, monkeypatch, fresh_cache):
    monkeypatch.setenv("WATERWEAVE_OFFLINE", "1")
    monkeypatch.setattr("urllib.request.urlopen", _no_network)
    body = client.get("/api/data-sources", params={"live": "true"}).json()
    assert body["offline_mode"] is True and body["requested_live"] is False
    assert "WATERWEAVE_OFFLINE" in body["skipped"][0]["reason"]
    assert client.get("/api/health").json()["offline_mode"] is True


def test_live_rainfall_is_reported_with_timestamps_and_cache_flag(client, monkeypatch, fresh_cache):
    calls = []

    def fake_urlopen(req, timeout=None):
        calls.append(req.full_url)
        return _FakeResponse({"current": {"time": "2026-10-10T12:00", "precipitation": 1.2}})

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    first = client.get("/api/data-sources").json()
    rain = _rain(first)
    assert rain["quality"]["status"] == "VERIFIED_LIVE"
    assert rain["value"] == pytest.approx(1.2)
    assert rain["source_timestamp"].startswith("2026-10-10T12:00")
    assert rain["served_from_cache"] is False
    # Rainfall is context only: the heuristic is off, so supply is unchanged.
    assert first["scenario_effect"]["supply_changed"] is False

    second = client.get("/api/data-sources").json()
    assert _rain(second)["served_from_cache"] is True and len(calls) == 1

    third = client.get("/api/data-sources", params={"refresh": "true"}).json()
    assert _rain(third)["served_from_cache"] is False and len(calls) == 2


def test_live_failure_is_reported_as_missing_not_invented(client, monkeypatch, fresh_cache):
    import urllib.error

    def failing(req, timeout=None):
        raise urllib.error.URLError("no route to host")

    monkeypatch.setattr("urllib.request.urlopen", failing)
    resp = client.get("/api/data-sources")
    assert resp.status_code == 200
    rain = _rain(resp.json())
    assert rain["quality"]["status"] == "ERROR" and rain["quality"]["missing"] is True
    assert rain["value"] is None
    assert "Network error" in rain["quality"]["error_details"]


# ---- recorded benchmark -----------------------------------------------------

def test_benchmark_serves_committed_results_with_provenance(client):
    body = client.get("/api/benchmark").json()
    default = body["default"]
    assert default["file"] == "benchmark_results/benchmark_default.json"
    assert default["instance"] == "synthetic-4x2"
    assert default["exact_optimum_objective"] == pytest.approx(6.0)
    assert default["provenance"]["engine_git_commit"]
    assert default["parameters"]["seeds"] == [0, 1, 2, 3, 4]
    rows = {(r["solver_name"], r["qaoa_p"]): r for r in default["summary"]}
    control = rows[("Uniform random sampling (shot-matched control)", None)]
    assert control["hit_optimum_rate"] == pytest.approx(1.0)
    assert rows[("QAOA (Quantum Heuristic)", 1)]["hit_optimum_rate"] == pytest.approx(0.8)
    assert all(c["status"] == "pass" for c in default["audit_checks"])


def test_benchmark_missing_files_give_404(client, monkeypatch, tmp_path):
    monkeypatch.setenv("WATERWEAVE_REPO_ROOT", str(tmp_path))
    resp = client.get("/api/benchmark")
    assert resp.status_code == 404
    assert "scripts/benchmark.py" in resp.json()["detail"]


# ---- serving the built frontend --------------------------------------------

def test_without_a_build_the_root_explains_how_to_build(monkeypatch, tmp_path):
    monkeypatch.setenv("WATERWEAVE_REPO_ROOT", str(tmp_path))
    local = TestClient(create_app())
    resp = local.get("/")
    assert resp.status_code == 200
    assert "npm run build" in resp.text
    assert local.get("/api/health").json()["frontend_built"] is False


def test_built_frontend_is_served_with_client_side_routes(monkeypatch, tmp_path):
    dist = tmp_path / "frontend" / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><div id=root></div>", encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    (dist / "favicon.svg").write_text("<svg/>", encoding="utf-8")
    monkeypatch.setenv("WATERWEAVE_REPO_ROOT", str(tmp_path))
    local = TestClient(create_app())
    assert local.get("/").text.startswith("<!doctype html>")
    assert local.get("/workspace").text.startswith("<!doctype html>")  # SPA route
    assert local.get("/assets/app.js").text == "console.log(1)"
    assert local.get("/favicon.svg").text == "<svg/>"
    assert local.get("/../pyproject.toml").text.startswith("<!doctype html>")
    assert local.get("/api/nope").status_code == 404
    assert local.get("/api/health").json()["frontend_built"] is True
