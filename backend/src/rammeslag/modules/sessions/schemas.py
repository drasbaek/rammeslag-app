"""Session wire shapes."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from rammeslag.modules.matches.schemas import MatchOut
from rammeslag.modules.seasons.schemas import SeasonRef
from rammeslag.modules.sessions.models import SESSION_TYPES


class SessionCreate(BaseModel):
    played_on: date
    type: str = Field(default="training", description=" | ".join(SESSION_TYPES))
    note: str | None = None


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    season: SeasonRef
    played_on: date
    type: str
    status: str
    note: str | None = None
    match_count: int = 0


class PlayerDeltaOut(BaseModel):
    player_id: str
    name: str
    delta: float
    rating: float


class RecapOut(BaseModel):
    biggest_riser: PlayerDeltaOut | None = None
    biggest_faller: PlayerDeltaOut | None = None
    bundprop: PlayerDeltaOut | None = None


class SessionDetailOut(BaseModel):
    id: str
    season: SeasonRef
    played_on: date
    type: str
    status: str
    note: str | None = None
    matches: list[MatchOut]
    recap: RecapOut
