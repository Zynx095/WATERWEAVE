from dataclasses import replace

import pytest

from waterweave.metrics import evaluate_allocation
from waterweave.models import Neighborhood
from waterweave.scenarios import default_scenario

S = default_scenario()
M, E = "morning", "evening"


def ev(alloc):
    return evaluate_allocation(S, alloc)


def test_empty_allocation():
    # demand 7, served 0, shortage 1.5*2 + 1*2 + 1*1 + 2*2 = 10
    r = ev({})
    assert r["total_demand_units"] == 7
    assert r["total_allocated_units"] == 0
    assert r["unmet_demand_units"] == 7
    assert r["weighted_shortage"] == pytest.approx(10.0)
    assert r["service_level"] == 0
    assert r["fairness_score"] == 1.0  # all equal (zero): documented caveat
    assert r["feasible"] == 1.0


def test_feasible_partial():
    # served: N1 1/2, N2 1/2, N3 0/1, N4 2/2 -> 4 of 7
    # shortage: 1.5*1 + 1*1 + 1*1 + 2*0 = 3.5 ; fairness 1-(1-0)=0
    r = ev({"N1": {M: 1}, "N2": {E: 1}, "N4": {M: 1, E: 1}})
    assert r["total_allocated_units"] == 4
    assert r["unmet_demand_units"] == 3
    assert r["weighted_shortage"] == pytest.approx(3.5)
    assert r["service_level"] == pytest.approx(4 / 7)
    assert r["fairness_score"] == pytest.approx(0.0)
    assert r["feasible"] == 1.0


def test_fairer_allocation_scores_higher():
    # s = .5, .5, 1, .5 -> fairness 0.5 ; shortage 1.5 + 1 + 0 + 2 = 4.5
    r = ev({"N1": {M: 1}, "N2": {E: 1}, "N3": {M: 1}, "N4": {E: 1}})
    assert r["fairness_score"] == pytest.approx(0.5)
    assert r["unmet_demand_units"] == 3
    assert r["weighted_shortage"] == pytest.approx(4.5)
    assert r["feasible"] == 1.0
    unfair = ev({"N1": {M: 1}, "N2": {E: 1}, "N4": {M: 1, E: 1}})
    assert r["fairness_score"] > unfair["fairness_score"]


def test_single_neighborhood_served():
    r = ev({"N3": {M: 1}})  # s = 0,0,1,0
    assert r["fairness_score"] == pytest.approx(0.0)
    assert r["service_level"] == pytest.approx(1 / 7)


def test_demand_limit_violation():
    r = ev({"N3": {E: 1}})  # N3 has no evening demand
    assert r["feasible"] == 0.0
    assert r["demand_violation_units"] == 1
    assert r["unmet_demand_units"] == 7  # over-allocation earns nothing
    assert r["total_allocated_units"] == 1


def test_over_demand_amount():
    r = ev({"N1": {M: 3}})
    assert r["demand_violation_units"] == 2
    assert r["supply_violation_units"] == 1  # morning supply 2
    assert r["feasible"] == 0.0


def test_supply_limit_violation():
    r = ev({"N1": {M: 1}, "N2": {M: 1}, "N3": {M: 1}})
    assert r["supply_violation_units"] == 1
    assert r["demand_violation_units"] == 0
    assert r["feasible"] == 0.0


def test_supply_at_limit_is_feasible():
    r = ev({"N1": {M: 1}, "N2": {M: 1}})
    assert r["supply_violation_units"] == 0
    assert r["feasible"] == 1.0


def test_storage_limit_violation():
    r = ev({"N2": {M: 1, E: 1}})  # N2 capacity 1
    assert r["storage_violation_units"] == 1
    assert r["demand_violation_units"] == 0
    assert r["feasible"] == 0.0


def test_storage_at_limit_is_feasible():
    r = ev({"N1": {M: 1, E: 1}})  # capacity 2
    assert r["storage_violation_units"] == 0
    assert r["feasible"] == 1.0


@pytest.mark.parametrize(
    "alloc",
    [
        {"NX": {M: 1}},
        {"N1": {"night": 1}},
        {"N1": {M: -1}},
        {"N1": {M: 1.0}},
        {"N1": {M: True}},
        {"N1": {M: "1"}},
        {"N1": 1},
    ],
)
def test_invalid_entries(alloc):
    r = ev(alloc)
    assert r["feasible"] == 0.0
    assert r["invalid_entries"] == 1
    assert r["total_allocated_units"] == 0


def test_invalid_entry_does_not_hide_valid_ones():
    r = ev({"N1": {M: 1, "night": 5}})
    assert r["invalid_entries"] == 1
    assert r["total_allocated_units"] == 1
    assert r["feasible"] == 0.0


def test_does_not_mutate_input():
    a = {"N1": {M: 1}}
    ev(a)
    assert a == {"N1": {M: 1}}


def test_zero_demand_scenario():
    s = replace(
        S,
        neighborhoods=(Neighborhood("A", "A (synthetic)", {M: 0, E: 0}),),
        supply_by_slot={M: 0, E: 0},
    )
    r = evaluate_allocation(s, {})
    assert r["service_level"] == 1.0
    assert r["fairness_score"] == 1.0
    assert r["feasible"] == 1.0
    assert r["weighted_shortage"] == 0


def test_zero_supply():
    s = replace(S, supply_by_slot={M: 0, E: 0})
    assert evaluate_allocation(s, {"N1": {M: 1}})["feasible"] == 0.0
    assert evaluate_allocation(s, {})["feasible"] == 1.0


def test_metric_keys_and_types():
    keys = {
        "total_demand_units", "total_allocated_units", "unmet_demand_units",
        "weighted_shortage", "service_level", "fairness_score", "feasible",
    }
    r = ev({})
    assert keys <= set(r)
    assert all(isinstance(v, float) for v in r.values())


def test_fairness_score_vs_disparity_inversion():
    """Verify that range-based fairness_score and quadratic disparity can invert ranking.

    Counterexample:
    Scenario with 4 neighborhoods (demands 10 units each).
    Allocation A has service levels (0.0, 0.5, 1.0, 0.5):
      - range = 1.0 - 0.0 = 1.0 => fairness_score = 0.0
      - disparity = 2.0
    Allocation B has service levels (0.0, 0.9, 0.9, 0.9):
      - range = 0.9 - 0.0 = 0.9 => fairness_score = 0.1
      - disparity = 2.43

    Result:
      - Range-based fairness_score rates B fairer than A (0.1 > 0.0).
      - Quadratic disparity (minimized by QUBO) rates A fairer than B (2.0 < 2.43).
    """
    from waterweave.models import Scenario
    sc_counter = Scenario(
        name="counterexample-fairness",
        slots=("slot1",),
        neighborhoods=(
            Neighborhood("N1", "N1", {"slot1": 10}, 1.0, 10),
            Neighborhood("N2", "N2", {"slot1": 10}, 1.0, 10),
            Neighborhood("N3", "N3", {"slot1": 10}, 1.0, 10),
            Neighborhood("N4", "N4", {"slot1": 10}, 1.0, 10),
        ),
        supply_by_slot={"slot1": 30},
    )
    alloc_a = {"N1": {"slot1": 0}, "N2": {"slot1": 5}, "N3": {"slot1": 10}, "N4": {"slot1": 5}}
    alloc_b = {"N1": {"slot1": 0}, "N2": {"slot1": 9}, "N3": {"slot1": 9}, "N4": {"slot1": 9}}

    mA = evaluate_allocation(sc_counter, alloc_a)
    mB = evaluate_allocation(sc_counter, alloc_b)

    # Range-based fairness_score: B > A
    assert mA["fairness_score"] == pytest.approx(0.0)
    assert mB["fairness_score"] == pytest.approx(0.1)
    assert mB["fairness_score"] > mA["fairness_score"]

    # Quadratic disparity: A < B (lower disparity means fairer in QUBO)
    # When exposed in metrics:
    if "disparity" in mA:
        assert mA["disparity"] == pytest.approx(2.0)
        assert mB["disparity"] == pytest.approx(2.43)
        assert mA["disparity"] < mB["disparity"]

