# Live Data Architecture

## Overview
The live data integration for WATERWEAVE is designed to complement the existing optimization engine (QAOA, exact, greedy solvers) with real-world or verified-static datasets, avoiding unnecessary coupling between data retrieval and the core mathematical formulation.

## Data Pipeline
1. **Source Adapters (Providers)**: Separate provider classes fetch data from external APIs (e.g., Open-Meteo for rainfall, static CSVs for population/supply).
2. **Retrieval and Refresh Mechanisms**: The `Streamlit` app controls refresh. Fetching uses `requests` with standard timeouts and retries.
3. **Data Normalization**: Adapters map raw JSON/CSV schemas into internal dataclasses (`LiveObservation`). Timestamps are standardized to ISO 8601 UTC. Missing data is explicitly tracked, not silently zeroed.
4. **Validation & Freshness**: A `validate_observation` function checks bounds. Freshness is calculated as `retrieval_timestamp - source_timestamp`.
5. **Caching**: We use an in-memory dictionary with TTL or `functools.lru_cache` combined with time checks to avoid rate-limits during dashboard interactions.
6. **Scenario Generation**: The `ScenarioBuilder` ingests a mix of live observations (e.g., real-time weather) and illustrative population parameters (for base prioritization), mapping them into the `Neighborhood` / `time slot` structure expected by the formulation. Hypothetical transformations (like converting rainfall directly into supply) are disabled by default.
7. **Fallback Behavior**: If APIs fail or rate limits are hit, the UI gracefully downgrades to synthetic or cached data, explicitly warning the user.

## Component Structure
`src/waterweave/data/`
- `models.py`: Dataclasses for `ProviderIdentity`, `Observation`, `DataQuality`.
- `registry.py`: Registration of available providers.
- `normalization.py`: Tools to handle unit conversions.
- `cache.py`: Wrapper for reliable TTL caching.
- `providers/`: Directory containing specific adapters (e.g., `open_meteo.py`, `bbmp_static.py`).
- `scenario_builder.py`: Maps observations to the default 4x2 or small 3x2 topology.

## Security
No API keys will be hardcoded. `Open-Meteo` uses unauthenticated public endpoints. Local CSVs will be placed in a trusted data directory.
