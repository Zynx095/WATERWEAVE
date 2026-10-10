# Data Model

This document defines the normalized schema used to convert heterogeneous municipal data into WATERWEAVE inputs.

## Models

### ProviderIdentity
Identifies the source of the data.
- `id`: str (e.g., "open_meteo", "bbmp_census")
- `name`: str
- `organization`: str
- `url`: str

### DataQuality
Represents the status and reliability of an observation.
- `status`: str (VERIFIED_LIVE, VERIFIED_STATIC, ESTIMATED, SYNTHETIC)
- `missing`: bool (True if the value could not be retrieved and has no fallback)
- `error_details`: str | None

### Observation
A unified data point from any provider.
- `provider_id`: str
- `dataset_id`: str
- `geographic_level`: str ("city", "ward", "neighborhood")
- `geographic_id`: str (e.g., "ward_151", "blr_center")
- `variable`: str ("rainfall_mm", "population", "supply_units")
- `value`: float | None
- `unit`: str
- `source_timestamp`: datetime (When the measurement was actually taken by the source)
- `retrieval_timestamp`: datetime (When WATERWEAVE fetched the data)
- `quality`: DataQuality

## Normalization Rules
1. **Null Handling**: If a provider returns `null` or omits a field, the `value` is set to `None` and `quality.missing` is `True`. 
2. **Timestamps**: All timestamps must be in UTC `datetime`.
3. **Geographic Mapping**: City-level data cannot be natively mapped to ward-level without explicit documented estimation rules.
4. **Units**: Rainfall is standard in `mm`, population in `count`, supply in `units`.
