# Data Validation Strategy

This document outlines the validation rules applied to municipal and environmental data fetched by WATERWEAVE before it enters the optimization pipeline.

## Validation Rules

### 1. Freshness and Timestamps
- **Live Data**: Observations from APIs (e.g., Open-Meteo) must have a `source_timestamp` within the last 24 hours to be marked `VERIFIED_LIVE`. Older data triggers a staleness warning in the dashboard.
- **Future Dates**: `source_timestamp` cannot be in the future.
- **Cache TTL**: Cached observations are invalidated if they exceed their configured Time-To-Live (e.g., 1 hour for weather).

### 2. Schema and Type Checks
- Values must strictly match the types defined in `Observation` (float for values, datetime for timestamps).
- If a JSON response lacks a required field (e.g., `current_weather.precipitation`), the parser must explicitly handle the `KeyError` and return an `Observation` with `missing=True`.

### 3. Bound and Logic Checks
- **Rainfall**: Must be $\ge 0$. Negative rainfall is rejected and marked missing.
- **Population/Demand**: Static population counts must be $\ge 0$.
- **Geographic Mismatches**: If a provider returns data for coordinates significantly outside Bengaluru's bounding box, it is rejected.

### 4. Application Integration Tests
- We mock HTTP responses using `unittest.mock` to ensure the validation logic correctly flags missing or out-of-bounds data.
- The `ScenarioBuilder` verifies that the final generated `Scenario` passes the existing formulation checks (e.g., no negative supply).
