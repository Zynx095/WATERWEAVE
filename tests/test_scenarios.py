from waterweave.scenarios import default_scenario


def test_deterministic():
    assert default_scenario() == default_scenario()


def test_shape_and_labels():
    s = default_scenario()
    assert len(s.neighborhoods) == 4
    assert len(s.slots) == 2
    assert "SYNTHETIC" in s.description
    assert all("synthetic" in n.name for n in s.neighborhoods)
    assert len({n.id for n in s.neighborhoods}) == 4


def test_internal_consistency():
    s = default_scenario()
    assert set(s.supply_by_slot) == set(s.slots)
    for n in s.neighborhoods:
        assert set(n.demand_by_slot) == set(s.slots)
        assert all(d >= 0 for d in n.demand_by_slot.values())
        assert n.priority_weight > 0
        assert n.storage_capacity_units >= 0
    assert all(v >= 0 for v in s.supply_by_slot.values())


def test_scarcity_and_binding_storage():
    s = default_scenario()
    demand = sum(sum(n.demand_by_slot.values()) for n in s.neighborhoods)
    assert demand > sum(s.supply_by_slot.values())
    assert any(
        n.storage_capacity_units < sum(n.demand_by_slot.values())
        for n in s.neighborhoods
    )


def test_seed_recorded():
    assert default_scenario(7).seed == 7
