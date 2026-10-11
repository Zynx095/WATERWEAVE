from datetime import datetime, timezone
from typing import List

from ..models import ProviderIdentity, Observation, DataQuality
from ..registry import DataProvider

class BbmpStaticProvider(DataProvider):
    """
    Illustrative neighbourhood populations for the default 4x2 synthetic topology.

    The module and provider id keep the name ``bbmp_static`` for compatibility,
    but the values are assumptions made by this project. They are NOT census
    records, were never published by BBMP, and have no source date.
    """
    @property
    def identity(self) -> ProviderIdentity:
        return ProviderIdentity(
            id="bbmp_static",
            name="Illustrative neighbourhood populations (not census data)",
            organization="WATERWEAVE project assumption",
            url=""
        )

    def fetch(self) -> List[Observation]:
        retrieval_time = datetime.now(timezone.utc)
        # No source exists, so there is no source timestamp. Giving these values
        # a date would imply a publication that never happened.
        source_time = None

        # Illustrative values of a plausible size for a Bengaluru ward. They do
        # not correspond to any verified BBMP or census record.
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
                dataset_id="ward_population_illustrative",
                geographic_level="neighborhood",
                geographic_id=ward_id,
                variable="population",
                value=float(pop),
                unit="count",
                source_timestamp=source_time,
                retrieval_timestamp=retrieval_time,
                quality=DataQuality(status="ILLUSTRATIVE", missing=False)
            ))
            
        return observations
