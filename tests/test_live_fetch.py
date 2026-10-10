import pytest
from waterweave.data.providers import open_meteo

@pytest.mark.skip(reason="Live API test - run manually with `pytest tests/test_live_fetch.py`")
def test_open_meteo_live_fetch():
    provider = open_meteo.OpenMeteoProvider()
    obs_list = provider.fetch()
    
    assert len(obs_list) == 1
    obs = obs_list[0]
    
    # We should have successfully hit the API
    assert obs.quality.missing is False
    assert obs.quality.status == "VERIFIED_LIVE"
    assert obs.variable == "rainfall_mm"
    assert obs.value >= 0.0
