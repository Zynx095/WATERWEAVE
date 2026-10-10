# Data Gaps and Limitations

## Missing Data
The following data points could not be obtained from open, real-time APIs:
1. **Real-time Reservoir and Pumping Levels**: BWSSB does not provide a public API for live reservoir metrics (e.g., KRS, Kabini levels directed to Bengaluru) or city-wide flow meters. 
2. **Ward-level Real-time Demand**: Household-level or ward-level live water consumption is not publicly broadcasted.
3. **Tanker Movement / Real-time Groundwater**: There is no live tracker for water tanker deployment or neighborhood groundwater levels available via open API.

## Estimations and Workarounds
- **Demand Estimation**: We use illustrative population parameters (mock values representing typical neighborhood sizes) rather than actual static census records, as ward-to-neighborhood mapping is non-trivial for the optimization topology. These are **ILLUSTRATIVE ESTIMATES**, not real census or consumption metrics.
- **Supply Allocation**: Since live supply flow isn't available, we initially considered a heuristic converting current rainfall (via Open-Meteo) directly to supply. This has been **disabled by default** to preserve scientific validity, as rainfall does not instantly translate to municipal pipe supply.
- **Synthetic Fallback**: If real weather or static census data fails to load, the system falls back to the fully synthetic `4x2` demonstration scenario to ensure the application continues functioning.
