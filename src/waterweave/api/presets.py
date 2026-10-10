"""Named scenario presets offered by the web frontend.

All presets are SYNTHETIC variations of ``waterweave.scenarios.default_scenario``
(the same variations the Streamlit dashboard offers), except
``illustrative-population``, whose priority weights come from the
illustrative (not census) population figures of the ``bbmp_static`` provider
via ``ScenarioBuilder``. None of them is measured municipal data.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, replace

from waterweave.data import ScenarioBuilder, registry
from waterweave.models import Scenario
from waterweave.scenarios import default_scenario


@dataclass(frozen=True)
class Preset:
    id: str
    label: str
    summary: str
    provenance: str  # "synthetic" or "illustrative"
    build: Callable[[], Scenario]


def _with_supply(morning: int, evening: int, name: str) -> Callable[[], Scenario]:
    def build() -> Scenario:
        base = default_scenario()
        return replace(base, name=name, supply_by_slot={"morning": morning, "evening": evening})

    return build


def _lakeside_priority() -> Scenario:
    base = default_scenario()
    neighborhoods = tuple(
        replace(n, priority_weight=3.0) if n.id == "N4" else n for n in base.neighborhoods
    )
    return replace(base, name="synthetic-4x2-lakeside-priority", neighborhoods=neighborhoods)


def _illustrative_population() -> Scenario:
    # Offline and deterministic: only the static provider is used. The live
    # rainfall provider would not change anything here, because the
    # rainfall-to-supply heuristic in ScenarioBuilder is disabled by default.
    observations = registry.get_provider("bbmp_static").fetch()
    scenario = ScenarioBuilder().build(observations)
    # The builder names neighborhoods "(Data-Driven)"; only the weights differ
    # from the synthetic default, so keep the synthetic names.
    names = {n.id: n.name for n in default_scenario().neighborhoods}
    neighborhoods = tuple(replace(n, name=names.get(n.id, n.name)) for n in scenario.neighborhoods)
    return replace(
        scenario,
        neighborhoods=neighborhoods,
        name="illustrative-population-4x2",
        description=(
            "SYNTHETIC demand and supply. Priority weights = illustrative population / 25,000 "
            "from the bbmp_static provider, whose figures are illustrative, not census records."
        ),
    )


PRESETS: dict[str, Preset] = {
    p.id: p
    for p in (
        Preset(
            "default",
            "Default scarcity",
            "Seven deliveries requested, four possible. Riverside can store only one unit.",
            "synthetic",
            default_scenario,
        ),
        Preset(
            "drought",
            "Severe drought",
            "Same neighborhoods, one unit per slot: two deliveries for seven requests.",
            "synthetic",
            _with_supply(1, 1, "synthetic-4x2-drought"),
        ),
        Preset(
            "ample",
            "Ample supply",
            "Enough water for every request; Riverside's storage limit still binds.",
            "synthetic",
            _with_supply(4, 3, "synthetic-4x2-ample"),
        ),
        Preset(
            "lakeside-priority",
            "Lakeside priority 3x",
            "Default scarcity, but Lakeside's shortage counts three times as much.",
            "synthetic",
            _lakeside_priority,
        ),
        Preset(
            "illustrative-population",
            "Illustrative population weights",
            "Default demand and supply; priority weights from illustrative population figures.",
            "illustrative",
            _illustrative_population,
        ),
    )
}
