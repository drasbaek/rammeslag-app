"""Season wire shapes."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class SeasonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    starts_on: date
    ends_on: date
    is_current: bool = False


class SeasonRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str


class SeasonCreate(BaseModel):
    """Dates are inclusive on both ends and may not overlap another season."""

    name: str = Field(min_length=1, max_length=120)
    starts_on: date
    ends_on: date


class SeasonUpdate(BaseModel):
    """Every field optional: omitted means unchanged."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    starts_on: date | None = None
    ends_on: date | None = None
