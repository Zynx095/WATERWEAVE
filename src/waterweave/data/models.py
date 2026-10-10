from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Any

@dataclass(frozen=True)
class ProviderIdentity:
    id: str
    name: str
    organization: str
    url: str

@dataclass(frozen=True)
class DataQuality:
    status: str  # e.g., 'VERIFIED_LIVE', 'VERIFIED_STATIC', 'ESTIMATED', 'SYNTHETIC'
    missing: bool
    error_details: Optional[str] = None

@dataclass(frozen=True)
class Observation:
    provider_id: str
    dataset_id: str
    geographic_level: str
    geographic_id: str
    variable: str
    value: Optional[float]
    unit: str
    source_timestamp: Optional[datetime]
    retrieval_timestamp: datetime
    quality: DataQuality
