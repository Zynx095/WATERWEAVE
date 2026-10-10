from typing import List, Dict
from datetime import datetime, timezone
from ..models import Scenario, Neighborhood
from .models import Observation

class ScenarioBuilder:
    def __init__(self, seed: int = 42):
        self.seed = seed
        # Base synthetic schema to fall back on or modify
        self.base_demand = {
            "N1": {"morning": 1, "evening": 1},
            "N2": {"morning": 1, "evening": 1},
            "N3": {"morning": 1, "evening": 0},
            "N4": {"morning": 1, "evening": 1},
        }
        self.base_storage = {"N1": 2, "N2": 1, "N3": 2, "N4": 2}
        self.names = {
            "N1": "Hillview (Data-Driven)",
            "N2": "Riverside (Data-Driven)",
            "N3": "Market (Data-Driven)",
            "N4": "Lakeside (Data-Driven)"
        }

    def build(self, observations: List[Observation]) -> Scenario:
        """
        Transforms live/static observations into a valid Scenario.
        """
        # 1. Parse Observations
        rainfall_mm = 0.0
        population_by_ward: Dict[str, float] = {}
        
        has_live_data = False
        data_sources = set()
        
        for obs in observations:
            if obs.quality.missing:
                continue
                
            data_sources.add(obs.provider_id)
            if obs.quality.status == "VERIFIED_LIVE":
                has_live_data = True
                
            if obs.variable == "rainfall_mm" and obs.geographic_id == "bengaluru":
                rainfall_mm = obs.value if obs.value is not None else 0.0
            elif obs.variable == "population" and obs.geographic_id.startswith("N"):
                if obs.value is not None:
                    population_by_ward[obs.geographic_id] = obs.value
        
        # 2. Adjust Supply based on Rainfall
        # For every 5mm of rain, we heuristically add 1 unit of supply to the evening slot
        supply_morning = 2
        supply_evening = 2
        
        if rainfall_mm >= 5.0:
            supply_evening += int(rainfall_mm // 5.0)
            
        # Cap supply to not exceed total demand (7) otherwise it's not a scarcity problem
        if supply_morning + supply_evening > 6:
            supply_evening = 6 - supply_morning
            
        # 3. Adjust Priority based on Population
        neighborhoods = []
        for n_id, demand in self.base_demand.items():
            # Default priority if population is missing
            priority = 1.0
            if n_id in population_by_ward:
                # 25000 population = 1.0 weight
                priority = round(population_by_ward[n_id] / 25000.0, 2)
                
            neighborhoods.append(
                Neighborhood(
                    id=n_id,
                    name=self.names[n_id],
                    demand_by_slot=demand,
                    priority_weight=priority,
                    storage_capacity_units=self.base_storage[n_id]
                )
            )
            
        # 4. Construct description
        mode = "LIVE/DATA-DRIVEN" if has_live_data else "STATIC DATA-DRIVEN"
        sources = ", ".join(sorted(list(data_sources))) if data_sources else "None (Fallback)"
        desc = (
            f"[{mode}] Scenario driven by real-world data constraints. "
            f"Sources: {sources}. Rainfall: {rainfall_mm}mm. "
            f"Priorities scaled by population."
        )
        
        return Scenario(
            name=f"data-driven-4x2",
            slots=("morning", "evening"),
            neighborhoods=tuple(neighborhoods),
            supply_by_slot={"morning": supply_morning, "evening": supply_evening},
            description=desc,
            seed=self.seed
        )
