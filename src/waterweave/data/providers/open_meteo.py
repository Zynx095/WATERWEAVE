import urllib.request
import urllib.error
import json
from datetime import datetime, timezone
from typing import List

from ..models import ProviderIdentity, Observation, DataQuality
from ..registry import DataProvider
from ..cache import ttl_cache

class OpenMeteoProvider(DataProvider):
    """
    Fetches real-time weather data (rainfall/precipitation) for Bengaluru using Open-Meteo.
    """
    
    # Bengaluru coordinates
    LAT = 12.9716
    LON = 77.5946

    @property
    def identity(self) -> ProviderIdentity:
        return ProviderIdentity(
            id="open_meteo",
            name="Open-Meteo Weather API",
            organization="Open-Meteo",
            url="https://open-meteo.com/"
        )

    @ttl_cache(ttl_seconds=300) # Cache for 5 minutes
    def fetch(self) -> List[Observation]:
        retrieval_time = datetime.now(timezone.utc)
        url = f"https://api.open-meteo.com/v1/forecast?latitude={self.LAT}&longitude={self.LON}&current=precipitation,weathercode&timezone=UTC"
        
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'WATERWEAVE-Research/1.0'})
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode('utf-8'))
                
                current = data.get('current', {})
                time_str = current.get('time')
                source_time = None
                if time_str:
                    source_time = datetime.fromisoformat(time_str).replace(tzinfo=timezone.utc)
                else:
                    source_time = retrieval_time
                
                rainfall_mm = current.get('precipitation', 0.0)
                
                obs = Observation(
                    provider_id=self.identity.id,
                    dataset_id="current_weather",
                    geographic_level="city",
                    geographic_id="bengaluru",
                    variable="rainfall_mm",
                    value=float(rainfall_mm) if rainfall_mm is not None else 0.0,
                    unit="mm",
                    source_timestamp=source_time,
                    retrieval_timestamp=retrieval_time,
                    quality=DataQuality(status="VERIFIED_LIVE", missing=False)
                )
                return [obs]

        except urllib.error.URLError as e:
            return [self._error_observation(retrieval_time, f"Network error: {str(e)}")]
        except json.JSONDecodeError as e:
            return [self._error_observation(retrieval_time, f"JSON parsing error: {str(e)}")]
        except Exception as e:
            return [self._error_observation(retrieval_time, f"Unexpected error: {str(e)}")]

    def _error_observation(self, retrieval_time: datetime, error_msg: str) -> Observation:
        return Observation(
            provider_id=self.identity.id,
            dataset_id="current_weather",
            geographic_level="city",
            geographic_id="bengaluru",
            variable="rainfall_mm",
            value=None,
            unit="mm",
            source_timestamp=None,
            retrieval_timestamp=retrieval_time,
            quality=DataQuality(status="ERROR", missing=True, error_details=error_msg)
        )
