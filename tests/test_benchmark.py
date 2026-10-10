"""Tests for scripts/benchmark.py.

Pure functions are checked against hand calculations (see comments). The
failure-path tests use a fake engine so they run without the optimisation
module; the integration test is skipped unless the real engine is importable.
"""
import importlib.util
import json
import math
import sys
from pathlib import Path

import numpy as np
import pytest

from waterweave.models import SolverResult
from waterweave.scenarios import default_scenario

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "benchmark.py"
spec = importlib.util.spec_from_file_location("wb_benchmark", SCRIPT)
bench = importlib.util.module_from_spec(spec)
sys.modules["wb_benchmark"] = bench
spec.loader.exec_module(bench)

SC = default_scenario()
ALPHA, P = 2.0, 15.0
VARS = [("N1", "morning"), ("N1", "evening"), ("N2", "morning"), ("N2", "evening"),
        ("N3", "morning"), ("N4", "morning"), ("N4", "evening")]


def obj(bits):
    t = bench.audit_terms(SC, bench.bits_to_allocation(SC, VARS, bits))
    return bench.audit_objective(t, ALPHA, P), t


def test_eligible_variables():
    assert bench.eligible_variables(SC) == VARS


def test_objective_serve_nobody():
    # shortage 1.5*2 + 1*2 + 1*1 + 2*2 = 10, disparity 0
    o, t = obj((0,) * 7)
    assert o == pytest.approx(10.0) and t["feasible"]


def test_objective_hand_optimum():
    # N1 evening, N2 evening, N3 morning, N4 morning: shortage 1.5+1+0+2 = 4.5,
    # levels (.5,.5,1,.5): three pairs differ by .5 -> disparity .75 -> 4.5+2*.75
    o, t = obj((0, 1, 0, 1, 1, 1, 0))
    assert t["shortage"] == pytest.approx(4.5)
    assert t["disparity"] == pytest.approx(0.75)
    assert o == pytest.approx(6.0) and t["feasible"]


def test_objective_priority_greedy_allocation():
    # N1 and N4 fully served: shortage 2+1 = 3; levels (1,0,0,1): 4 pairs differ
    # by 1 -> disparity 4 -> 3 + 8 = 11, which is WORSE than serving nobody (10).
    o, t = obj((1, 1, 0, 0, 0, 1, 1))
    assert t["shortage"] == pytest.approx(3.0)
    assert t["disparity"] == pytest.approx(4.0)
    assert o == pytest.approx(11.0)


def test_objective_penalises_storage_and_supply():
    # N2 both slots: storage 2 > 1 -> violation 1 -> +15; shortage 1.5*2+0+1+4=8
    # levels (0,1,0,0): 3 pairs differ by 1 -> disparity 3 -> 8 + 6 + 15 = 29
    o, t = obj((0, 0, 1, 1, 0, 0, 0))
    assert not t["feasible"]
    assert o == pytest.approx(29.0)
    # all ones: morning 4>2 (v=2 -> 4), evening 3>2 (1), N2 storage (1) -> 6 * 15
    o, t = obj((1,) * 7)
    assert t["violation_sq"] == pytest.approx(6.0)
    assert o == pytest.approx(90.0)


def test_enumeration_facts():
    enum = bench.enumerate_instance(SC, ALPHA, P)
    st = enum["states"]
    feas = [s for s in st if s["feasible"]]
    assert len(st) == 128 and len(feas) == 65
    best = min(s["objective"] for s in feas)
    assert best == pytest.approx(6.0)
    assert sum(1 for s in feas if abs(s["objective"] - best) < 1e-9) == 3
    assert min(s["objective"] for s in st if not s["feasible"]) == pytest.approx(19.5)


def test_serve_nobody_threshold_matches_bruteforce():
    enum = bench.enumerate_instance(SC, ALPHA, P)
    a_star = bench.serve_nobody_threshold(enum["states"])
    assert a_star == pytest.approx(22 / 3)  # (10 - 4.5) / 0.75
    feas = [s for s in enum["states"] if s["feasible"]]

    def units(a):
        return sum(min(feas, key=lambda s: s["shortage"] + a * s["disparity"])["bits"])

    assert units(a_star - 0.01) > 0
    assert units(a_star + 0.01) == 0


def test_small_instance_shape():
    handles = {"default_scenario": default_scenario}
    sc = bench.build_instance(handles, "small", 42)
    assert [n.id for n in sc.neighborhoods] == ["N2", "N3", "N4"]
    assert "SYNTHETIC" in sc.description
    assert len(bench.eligible_variables(sc)) == 5
    with pytest.raises(ValueError):
        bench.build_instance(handles, "huge", 42)


def test_qaoa_probabilities_hand_cases():
    # gamma = 0: |+> is a mixer eigenstate, distribution stays uniform
    p = bench.qaoa_probabilities(np.array([0.0, 1.0, 2.0, 3.0]), 2, [0.0], [0.7])
    assert p == pytest.approx([0.25] * 4)
    # n=1, E=[0,1], gamma=pi/2 -> (1,-i)/sqrt2; beta=pi/4 rotates it onto |1>
    p = bench.qaoa_probabilities(np.array([0.0, 1.0]), 1, [math.pi / 2], [math.pi / 4])
    assert p == pytest.approx([0.0, 1.0], abs=1e-12)
    p = bench.qaoa_probabilities(np.array([0.3, 1.1, 2.0, 0.4]), 2, [0.9, 0.2], [0.4, 1.3])
    assert p.sum() == pytest.approx(1.0)


def test_summarise_statistics():
    rows = [
        {"solver_name": "S", "qaoa_p": None, "status": "ok", "feasible": True, "hit_optimum": True,
         "objective": 6.0, "approximation_ratio": 1.0, "runtime_seconds": 1.0},
        {"solver_name": "S", "qaoa_p": None, "status": "ok", "feasible": False, "hit_optimum": False,
         "objective": 8.0, "approximation_ratio": 8 / 6, "runtime_seconds": 3.0},
        {"solver_name": "S", "qaoa_p": None, "status": "error", "feasible": False, "hit_optimum": False,
         "objective": None, "approximation_ratio": None, "runtime_seconds": None},
    ]
    s = bench.summarise(rows)[0]
    assert (s["runs"], s["ok_runs"], s["failed_runs"]) == (3, 2, 1)
    assert s["objective_mean"] == pytest.approx(7.0)
    assert s["objective_sd"] == pytest.approx(math.sqrt(2.0))
    assert s["feasible_rate"] == pytest.approx(0.5)
    assert s["runtime_median_s"] == pytest.approx(2.0)


# ---- failure paths with a fake engine ---------------------------------

EXACT_BITS = (0, 1, 0, 1, 1, 1, 0)


def _result(name, bits, md=None):
    from waterweave.metrics import evaluate_allocation

    a = bench.bits_to_allocation(SC, VARS, bits)
    o, t = obj(bits)
    return SolverResult(name, a, o, t["feasible"], evaluate_allocation(SC, a), 0.01, md or {})


def _fake_handles(run_comparison):
    from waterweave.metrics import evaluate_allocation

    return {"run_comparison": run_comparison, "default_scenario": default_scenario,
            "evaluate_allocation": evaluate_allocation, "formulation": None}


def _run(monkeypatch, tmp_path, run_comparison):
    monkeypatch.setattr(bench, "_import_engine", lambda: _fake_handles(run_comparison))
    args = ["--seeds", "0", "--p-values", "1", "--penalty-weight", "15",
            "--out-dir", str(tmp_path), "--skip-audit", "--no-random-control"]
    rc = bench.main(args)
    payload = json.loads((tmp_path / "benchmark_default.json").read_text(encoding="utf-8"))
    return rc, payload


def test_engine_missing_exits_2_and_writes_nothing(monkeypatch, tmp_path, capsys):
    def boom():
        raise RuntimeError("engine not here")

    monkeypatch.setattr(bench, "_import_engine", boom)
    assert bench.main(["--out-dir", str(tmp_path)]) == 2
    assert list(tmp_path.iterdir()) == []
    assert "engine not here" in capsys.readouterr().err


def test_good_fake_engine_exit_0(monkeypatch, tmp_path):
    md = {"solver_type": "quantum_approximate", "layers_p": 1, "shots": 8,
          "modal_bitstring": "0" * 12, "optimal_gammas": [0.1], "optimal_betas": [0.2]}

    def rc_fn(sc, include_qaoa=True, **kw):
        return [_result("Exact", EXACT_BITS), _result("QAOA (Quantum Heuristic)", EXACT_BITS, md)]

    rc, payload = _run(monkeypatch, tmp_path, rc_fn)
    assert rc == 0
    q = [r for r in payload["runs"] if "QAOA" in r["solver_name"]][0]
    assert q["objective"] == 6.0 and q["hit_optimum"] and q["objective_delta_vs_audit"] == 0.0
    assert q["derived_modal_feasible"] is True  # all-zero bitstring = serve nobody
    assert payload["meta"]["fairness_weight"] == 2.0


def test_qaoa_error_is_recorded_not_replaced(monkeypatch, tmp_path):
    md = {"solver_type": "quantum_approximate", "error": "RuntimeError: boom"}

    def rc_fn(sc, include_qaoa=True, **kw):
        bad = _result("QAOA (Quantum Heuristic)", (0,) * 7, md)
        bad.objective_value = float("inf")
        bad.feasible = False
        return [_result("Exact", EXACT_BITS), bad]

    rc, payload = _run(monkeypatch, tmp_path, rc_fn)
    assert rc == 3
    q = [r for r in payload["runs"] if "QAOA" in r["solver_name"]][0]
    assert q["status"] == "error" and q["error"] == "RuntimeError: boom"
    assert q["objective"] is None and q["hit_optimum"] is False
    assert not any(r["solver_name"] == "Exact" and r["status"] == "error" for r in payload["runs"])


def test_missing_qaoa_result_fails(monkeypatch, tmp_path):
    def rc_fn(sc, include_qaoa=True, **kw):
        return [_result("Exact", EXACT_BITS)]

    rc, payload = _run(monkeypatch, tmp_path, rc_fn)
    assert rc == 3
    assert any(r["status"] == "error" and "no QAOA result" in r["error"] for r in payload["runs"])


def test_classical_result_labelled_qaoa_is_rejected(monkeypatch, tmp_path):
    def rc_fn(sc, include_qaoa=True, **kw):
        return [_result("QAOA (Quantum Heuristic)", EXACT_BITS, {"solver_type": "classical_exact"})]

    rc, payload = _run(monkeypatch, tmp_path, rc_fn)
    assert rc == 3
    assert payload["runs"][0]["status"] == "error"


def test_objective_disagreement_exits_4(monkeypatch, tmp_path):
    md = {"solver_type": "quantum_approximate"}

    def rc_fn(sc, include_qaoa=True, **kw):
        wrong = _result("QAOA (Quantum Heuristic)", EXACT_BITS, md)
        wrong.objective_value = 5.0  # claims better than the independent value 6.0
        return [wrong]

    rc, payload = _run(monkeypatch, tmp_path, rc_fn)
    assert rc == 4
    assert payload["objective_mismatches_vs_audit"] == 1


# ---- integration with the real engine (skipped when absent) -------------

def test_real_engine_small_instance(tmp_path):
    pytest.importorskip("waterweave.optimization")
    pytest.importorskip("waterweave.formulation")
    rc = bench.main(["--instance", "small", "--seeds", "0", "1", "--p-values", "1",
                     "--out-dir", str(tmp_path)])
    assert rc == 0
    payload = json.loads((tmp_path / "benchmark_small.json").read_text(encoding="utf-8"))
    assert (tmp_path / "benchmark_small.csv").exists()
    assert all(c["status"] in ("pass", "skipped") for c in payload["audit"]["checks"])
    names = {r["solver_name"] for r in payload["runs"]}
    assert any("Exact" in n for n in names) and any("QAOA" in n for n in names)
    exact = [r for r in payload["runs"] if "Exact" in r["solver_name"]][0]
    assert exact["objective"] == pytest.approx(payload["meta"]["exact_optimum_objective_independent"])
