"""Deterministic, explicitly SYNTHETIC scenarios for WATERWEAVE.

Nothing here is live or measured municipal data.
"""

from waterweave.models import Neighborhood, Scenario

SLOTS = ("morning", "evening")


def default_scenario(seed: int = 42) -> Scenario:
    """Four synthetic neighborhoods, two delivery slots, scarce supply.

    The scenario is fixed and does not depend on ``seed``; the seed is only
    recorded on the returned Scenario so callers can pass it through.

    Design (each unit = one binary allocation decision x[i, t]):
      total demand = 7 units, total supply = 4 units, so shortage is forced.
      Riverside has demand in both slots but storage for only 1 unit, so the
      storage limit binds (max servable 1 of 2).
    """
    neighborhoods = (
        Neighborhood("N1", "Hillview (synthetic)",
                     {"morning": 1, "evening": 1}, 1.5, 2),
        Neighborhood("N2", "Riverside (synthetic)",
                     {"morning": 1, "evening": 1}, 1.0, 1),
        Neighborhood("N3", "Market (synthetic)",
                     {"morning": 1, "evening": 0}, 1.0, 2),
        Neighborhood("N4", "Lakeside (synthetic)",
                     {"morning": 1, "evening": 1}, 2.0, 2),
    )
    return Scenario(
        name="synthetic-4x2",
        slots=SLOTS,
        neighborhoods=neighborhoods,
        supply_by_slot={"morning": 2, "evening": 2},
        description=(
            "SYNTHETIC demonstration data. Not live or measured municipal "
            "data and not based on any real water network."
        ),
        seed=seed,
    )
