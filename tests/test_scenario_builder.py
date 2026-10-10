import pytest
from datetime import datetime, timezone
from waterweave.data import ScenarioBuilder, Observation, DataQuality

def test_scenario_builder_no_data():
    builder = ScenarioBuilder()
    scenario = builder.build([])
    
    assert scenario.supply_by_slot["morning"] == 2
    assert scenario.supply_by_slot["evening"] == 2
    assert "None (Fallback)" in scenario.description

def test_scenario_builder_with_data():
    now = datetime.now(timezone.utc)
    obs1 = Observation(
        provider_id="open_meteo",
        dataset_id="weather",
        geographic_level="city",
        geographic_id="bengaluru",
        variable="rainfall_mm",
        value=6.0,
        unit="mm",
        source_timestamp=now,
        retrieval_timestamp=now,
        quality=DataQuality(status="VERIFIED_LIVE", missing=False)
    )
    obs2 = Observation(
        provider_id="bbmp_static",
        dataset_id="census",
        geographic_level="neighborhood",
        geographic_id="N1",
        variable="population",
        value=50000.0,
        unit="count",
        source_timestamp=now,
        retrieval_timestamp=now,
        quality=DataQuality(status="VERIFIED_STATIC", missing=False)
    )
    
    builder = ScenarioBuilder()
    scenario = builder.build([obs1, obs2])
    
    # Rainfall = 6.0 >= 5.0 -> evening supply + 1
    assert scenario.supply_by_slot["evening"] == 3
    assert scenario.supply_by_slot["morning"] == 2
    
    # N1 population = 50000 -> priority = 50000 / 25000 = 2.0
    n1 = next(n for n in scenario.neighborhoods if n.id == "N1")
    assert n1.priority_weight == 2.0
    
    # N2 has no population data, falls back to 1.0
    n2 = next(n for n in scenario.neighborhoods if n.id == "N2")
    assert n2.priority_weight == 1.0
    
    assert "LIVE/DATA-DRIVEN" in scenario.description
    assert "open_meteo" in scenario.description
