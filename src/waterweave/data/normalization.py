from datetime import datetime, timezone, timedelta
from typing import Optional
from .models import Observation

def is_fresh(observation: Observation, max_age_seconds: int = 86400) -> bool:
    """
    Returns True if the observation's source timestamp is within max_age_seconds.
    Defaults to 24 hours (86400 seconds).
    """
    if observation.quality.missing or observation.source_timestamp is None:
        return False
    
    now = datetime.now(timezone.utc)
    age = now - observation.source_timestamp
    return age <= timedelta(seconds=max_age_seconds)

def validate_observation(observation: Observation) -> Observation:
    """
    Applies bounds and logic checks. 
    Returns the observation if valid, or a missing-flagged copy if invalid.
    """
    if observation.quality.missing or observation.value is None:
        return observation

    # Reject negative rainfall or demand
    if observation.variable in ["rainfall_mm", "population", "supply_units"]:
        if observation.value < 0:
            from .models import DataQuality
            import copy
            
            # Since dataclasses are frozen, we use object.__setattr__ or replace
            import dataclasses
            new_quality = DataQuality(
                status="ERROR", 
                missing=True, 
                error_details=f"Invalid negative value for {observation.variable}"
            )
            return dataclasses.replace(observation, value=None, quality=new_quality)

    return observation

def convert_rainfall_to_supply_modifier(rainfall_mm: float) -> float:
    """
    Heuristic to adjust supply availability based on rainfall.
    e.g. For every 10mm of recent rain, local supply improves by 0.5 units (just an example).
    """
    return (rainfall_mm / 10.0) * 0.5
