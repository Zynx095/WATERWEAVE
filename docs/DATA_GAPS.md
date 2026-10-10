# Data Gaps and Limitations

## Missing Data
The following data points could not be obtained from open, real-time APIs:
1. **Real-time Reservoir and Pumping Levels**: BWSSB does not provide a public API for live reservoir metrics (e.g., KRS, Kabini levels directed to Bengaluru) or city-wide flow meters. 
2. **Ward-level Real-time Demand**: Household-level or ward-level live water consumption is not publicly broadcasted.
3. **Tanker Movement / Real-time Groundwater**: There is no live tracker for water tanker deployment or neighborhood groundwater levels available via open API.

## Estimations and Workarounds
- **Demand Estimation**: We use static 2011/recent census population data for Bengaluru wards to estimate baseline water demand, applying a standard per-capita norm. These are **ESTIMATES**, not live consumption metrics.
- **Supply Allocation**: Since live supply flow isn't available, we model supply as a relative fraction of demand based on weather variables. For example, high current rainfall (via Open-Meteo) can probabilistically reduce municipal supply stress, acting as a heuristic proxy.
- **Synthetic Fallback**: If real weather or static census data fails to load, the system falls back to the fully synthetic `4x2` demonstration scenario to ensure the application continues functioning.
