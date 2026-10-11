from typing import Dict, List, Type
from abc import ABC, abstractmethod
from .models import Observation, ProviderIdentity

class DataProvider(ABC):
    @property
    @abstractmethod
    def identity(self) -> ProviderIdentity:
        pass

    @abstractmethod
    def fetch(self) -> List[Observation]:
        pass

class ProviderRegistry:
    def __init__(self):
        self._providers: Dict[str, DataProvider] = {}

    def register(self, provider: DataProvider):
        self._providers[provider.identity.id] = provider

    def get_provider(self, provider_id: str) -> DataProvider:
        if provider_id not in self._providers:
            raise KeyError(f"Provider '{provider_id}' not found.")
        return self._providers[provider_id]

    def get_all(self) -> List[DataProvider]:
        return list(self._providers.values())

    def fetch_all(self) -> List[Observation]:
        observations = []
        for provider in self._providers.values():
            try:
                observations.extend(provider.fetch())
            except Exception as e:
                # In a robust system, we would log this and return a missing observation
                # to track the error, rather than crashing everything.
                from datetime import datetime, timezone
                from .models import Observation, DataQuality
                observations.append(Observation(
                    provider_id=provider.identity.id,
                    dataset_id="unknown",
                    geographic_level="unknown",
                    geographic_id="unknown",
                    variable="unknown",
                    value=None,
                    unit="unknown",
                    source_timestamp=None,
                    retrieval_timestamp=datetime.now(timezone.utc),
                    quality=DataQuality(status="ERROR", missing=True, error_details=str(e))
                ))
        return observations

# Global registry instance
registry = ProviderRegistry()
