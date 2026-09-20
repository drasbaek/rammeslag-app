"""Session wire shapes."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from rammeslag.modules.matches.schemas import MatchOut
from rammeslag.modules.players.schemas import PlayerOut
from rammeslag.modules.seasons.schemas import SeasonRef
from rammeslag.modules.sessions.models import SESSION_TYPES


class SessionCreate(BaseModel):
    played_on: date
    type: str = Field(default="training", description=" | ".join(SESSION_TYPES))
    note: str | None = None


class SessionUpdate(BaseModel):
    """PATCH /api/sessions/{id}. Every field is optional; an omitted one is left
    alone. An empty ``note`` clears it -- there is nothing else an empty note
    could mean."""

    played_on: date | None = None
    type: str | None = Field(default=None, description=" | ".join(SESSION_TYPES))
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
    #: The training this evening was planned as. Null for everything imported
    #: from the old spreadsheet, and for any evening without a training.
    event_id: str | None = None
    #: Kampe on the plan. ``match_count`` against this is "three of six typed
    #: in", which is what the history row and the "+" menu both need.
    planned_count: int = 0


class PlayerDeltaOut(BaseModel):
    player_id: str
    name: str
    delta: float
    rating: float


class RecapOut(BaseModel):
    biggest_riser: PlayerDeltaOut | None = None
    biggest_faller: PlayerDeltaOut | None = None
    bundprop: PlayerDeltaOut | None = None


class PlannedGameOut(BaseModel):
    """A kamp off the training's plan, and the result somebody typed in for it.

    ``match_id`` is null until then. Nothing here is a match: the plan never
    becomes one on its own, and this only says which one answered it.
    """

    round: int
    court: int
    team_a: list[PlayerOut]
    team_b: list[PlayerOut]
    match_id: str | None = None


class SessionDetailOut(BaseModel):
    id: str
    season: SeasonRef
    played_on: date
    type: str
    status: str
    note: str | None = None
    event_id: str | None = None
    matches: list[MatchOut]
    #: In round and court order. Empty for an evening with no training behind
    #: it, which is every evening the old spreadsheet left behind.
    planned: list[PlannedGameOut] = []
    recap: RecapOut
