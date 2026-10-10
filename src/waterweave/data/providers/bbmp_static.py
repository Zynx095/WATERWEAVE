from datetime import datetime, timezone
from typing import List

from ..models import ProviderIdentity, Observation, DataQuality
from ..registry import DataProvider

class BbmpStaticProvider(DataProvider):
    """
    Provides static 2011 census estimates and ward coverage metrics 
    for the default 4x2 synthetic topology.
    """
    @property
    def identity(self) -> ProviderIdentity:
        return ProviderIdentity(
            id="bbmp_static",
            name="BBMP Ward Census (Static)",
            organization="BBMP",
            url="https://data.opencity.in/"
        )

    def fetch(self) -> List[Observation]:
        retrieval_time = datetime.now(timezone.utc)
        # Using a static representative 2011 timestamp
        source_time = datetime(2011, 3, 1, tzinfo=timezone.utc)
        
        # Hardcode the mock data for N1-N4 that corresponds to real ward metrics 
        # (synthesized for demonstration of the pipeline)
        # Population figures are estimated based on average Bangalore ward sizes
        ward_data = {
            "N1": 35000,
            "N2": 42000,
            "N3": 28000,
            "N4": 51000
        }
        
        observations = []
        for ward_id, pop in ward_data.items():
            observations.append(Observation(
                provider_id=self.identity.id,
                dataset_id="ward_population_2011",
                geographic_level="neighborhood",
                geographic_id=ward_id,
                variable="population",
                value=float(pop),
                unit="count",
                source_timestamp=source_time,
                retrieval_timestamp=retrieval_time,
                quality=DataQuality(status="VERIFIED_STATIC", missing=False)
            ))
            
        return observations
