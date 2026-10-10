import pytest
from datetime import datetime, timezone, timedelta
from waterweave.data import (
    registry, 
    is_fresh, 
    validate_observation,
    Observation,
    DataQuality
)

def test_provider_registration():
    providers = registry.get_all()
    assert len(providers) >= 2
    ids = [p.identity.id for p in providers]
    assert "open_meteo" in ids
    assert "bbmp_static" in ids

def test_bbmp_static_fetch():
    provider = registry.get_provider("bbmp_static")
    obs_list = provider.fetch()
    assert len(obs_list) == 4
    for obs in obs_list:
        assert obs.quality.status == "ILLUSTRATIVE"
        assert obs.variable == "population"
        assert obs.value > 0

def test_normalization_and_freshness():
    now = datetime.now(timezone.utc)
    obs_fresh = Observation(
        provider_id="test",
        dataset_id="test",
        geographic_level="city",
        geographic_id="city",
        variable="rainfall_mm",
        value=10.0,
        unit="mm",
        source_timestamp=now - timedelta(hours=1),
        retrieval_timestamp=now,
        quality=DataQuality(status="VERIFIED_LIVE", missing=False)
    )
    assert is_fresh(obs_fresh, max_age_seconds=7200) == True
    assert is_fresh(obs_fresh, max_age_seconds=1800) == False

def test_validation_rejects_negative_rainfall():
    now = datetime.now(timezone.utc)
    obs_invalid = Observation(
        provider_id="test",
        dataset_id="test",
        geographic_level="city",
        geographic_id="city",
        variable="rainfall_mm",
        value=-5.0,
        unit="mm",
        source_timestamp=now,
        retrieval_timestamp=now,
        quality=DataQuality(status="VERIFIED_LIVE", missing=False)
    )
    validated = validate_observation(obs_invalid)
    assert validated.value is None
    assert validated.quality.missing is True
    assert "negative" in validated.quality.error_details.lower()
