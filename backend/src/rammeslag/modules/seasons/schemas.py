"""Season wire shapes."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict


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
