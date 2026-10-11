"""Request validation for the WATERWEAVE API.

Limits are chosen so that every accepted request can be answered by the
existing engine in a few seconds:

* Each decision ``x[i, t]`` delivers at most one unit, so per-slot demand is
  0 or 1; a larger value could never be served and would only add shortage.
* At most 12 decision variables, so exact enumeration stays at <= 4,096
  candidates.
* QAOA depth p <= 3. The qubit limit for QAOA (see ``service.MAX_QAOA_QUBITS``)
  depends on slack bits and is checked after the model is built.
"""

from __future__ import annotations

import math
import re

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    field_validator,
    model_validator,
)

MAX_DECISIONS = 12
_SLOT_RE = re.compile(r"^[A-Za-z][A-Za-z0-9 _-]{0,23}$")
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,12}$")


class NeighborhoodIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str = Field(min_length=1, max_length=60)
    demand_by_slot: dict[str, StrictInt]
    priority_weight: float = Field(1.0, ge=0.1, le=10.0)
    storage_capacity_units: int = Field(2, ge=0, le=10)

    @field_validator("id")
    @classmethod
    def _check_id(cls, value: str) -> str:
        if not _ID_RE.match(value):
            raise ValueError("id must be 1-12 letters, digits, '_' or '-'")
        return value

    @field_validator("priority_weight")
    @classmethod
    def _finite_weight(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("priority_weight must be finite")
        return value

    @field_validator("demand_by_slot")
    @classmethod
    def _binary_demand(cls, value: dict[str, int]) -> dict[str, int]:
        for slot, units in value.items():
            if units not in (0, 1):
                raise ValueError(
                    f"demand for slot '{slot}' must be 0 or 1: each decision delivers one unit"
                )
        return value


class ScenarioIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field("custom", min_length=1, max_length=80)
    description: str = Field("", max_length=600)
    slots: list[str] = Field(min_length=1, max_length=3)
    supply_by_slot: dict[str, StrictInt]
    neighborhoods: list[NeighborhoodIn] = Field(min_length=1, max_length=6)
    seed: int = Field(42, ge=0, le=2**31 - 1)

    @field_validator("slots")
    @classmethod
    def _check_slots(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("slot names must be unique")
        for slot in value:
            if not _SLOT_RE.match(slot):
                raise ValueError(f"invalid slot name '{slot}'")
        return value

    @model_validator(mode="after")
    def _check_consistency(self) -> ScenarioIn:
        slots = set(self.slots)
        unknown = set(self.supply_by_slot) - slots
        if unknown:
            raise ValueError(f"supply_by_slot has unknown slot(s): {sorted(unknown)}")
        for slot, units in self.supply_by_slot.items():
            if not 0 <= units <= 20:
                raise ValueError(f"supply for slot '{slot}' must be an integer from 0 to 20")
        ids = [n.id for n in self.neighborhoods]
        if len(set(ids)) != len(ids):
            raise ValueError("neighborhood ids must be unique")
        decisions = 0
        for n in self.neighborhoods:
            extra = set(n.demand_by_slot) - slots
            if extra:
                raise ValueError(f"neighborhood '{n.id}' has demand for unknown slot(s): {sorted(extra)}")
            decisions += sum(n.demand_by_slot.get(s, 0) for s in self.slots)
        if decisions > MAX_DECISIONS:
            raise ValueError(
                f"{decisions} decision variables requested; the limit is {MAX_DECISIONS} "
                "so exact enumeration stays fast"
            )
        return self


class SolveSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    include_qaoa: bool = True
    fairness_weight: float = Field(2.0, ge=0.0, le=20.0)
    penalty_weight: float | None = Field(None, gt=0.0, le=1000.0)
    p: int = Field(1, ge=1, le=3)
    shots: int = Field(1024, ge=16, le=8192)
    maxiter: int = Field(25, ge=1, le=200)
    seed: int | None = Field(None, ge=0, le=2**31 - 1)


class SolveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenario: ScenarioIn
    settings: SolveSettings = SolveSettings()


class ModelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenario: ScenarioIn
    fairness_weight: float = Field(2.0, ge=0.0, le=20.0)
    penalty_weight: float | None = Field(None, gt=0.0, le=1000.0)


class EvaluateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenario: ScenarioIn
    allocation: dict[str, dict[str, int]]
    fairness_weight: float = Field(2.0, ge=0.0, le=20.0)
    penalty_weight: float | None = Field(None, gt=0.0, le=1000.0)

    @field_validator("allocation")
    @classmethod
    def _bounded_allocation(cls, value: dict[str, dict[str, int]]) -> dict[str, dict[str, int]]:
        # Unknown ids and slots are scored as invalid entries rather than
        # rejected, but the payload must stay the size of a real scenario.
        if len(value) > 20 or any(len(slots) > 10 for slots in value.values()):
            raise ValueError("allocation has more neighborhoods or slots than any accepted scenario")
        return value
