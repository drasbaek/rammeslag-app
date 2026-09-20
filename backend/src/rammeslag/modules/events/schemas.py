"""Event wire shapes."""

from __future__ import annotations

from datetime import date, datetime, time

from pydantic import BaseModel, Field, field_validator

from rammeslag.modules.events.models import EVENT_STATUSES, EVENT_TYPES, RESPONSE_STATES
from rammeslag.modules.players.schemas import PlayerOut
from rammeslag.modules.seasons.schemas import SeasonRef


class EventCreate(BaseModel):
    type: str = Field(description=" | ".join(EVENT_TYPES))
    held_on: date
    start_time: time
    #: Omitted means Pakhus77 for a training; a fixture has to say, because an
    #: away kamp is somewhere new every time.
    venue: str | None = Field(default=None, max_length=120)
    #: Fixtures only. Ignored for a training.
    opponent: str | None = Field(default=None, max_length=120)
    #: Omitted means six for a fixture, twelve (three courts) for a training.
    capacity: int | None = Field(default=None, ge=1, le=40)
    note: str | None = None


class EventUpdate(BaseModel):
    """PATCH /api/events/{id}. Omitted means unchanged; an empty note clears it."""

    held_on: date | None = None
    start_time: time | None = None
    venue: str | None = Field(default=None, max_length=120)
    opponent: str | None = Field(default=None, max_length=120)
    capacity: int | None = Field(default=None, ge=1, le=40)
    status: str | None = Field(default=None, description=" | ".join(EVENT_STATUSES))
    note: str | None = None


class EventCountsOut(BaseModel):
    yes: int
    no: int
    maybe: int
    #: Members who have not answered at all. Guests are never counted.
    unanswered: int


class EventOut(BaseModel):
    id: str
    season: SeasonRef
    type: str
    held_on: date
    start_time: time
    venue: str
    opponent: str | None = None
    capacity: int
    status: str
    note: str | None = None
    #: Set once a training's results have somewhere to go.
    session_id: str | None = None
    counts: EventCountsOut
    #: How many an admin has picked. Availability is not selection.
    selected_count: int
    #: ``counts.yes - capacity``. The old spreadsheet's bottom row.
    surplus: int
    #: The caller's own answer, or null when they have not answered or are
    #: not logged in.
    my_state: str | None = None


class EventResponseOut(BaseModel):
    player: PlayerOut
    state: str = Field(description=" | ".join(RESPONSE_STATES))
    #: Who wrote it. Different from ``player.id`` whenever somebody answered on
    #: another person's behalf: the member who brought a guest, or an admin
    #: recording an answer that only ever arrived in the group chat.
    added_by: str | None = None
    updated_at: datetime


class EventMatchupOut(BaseModel):
    round: int
    court: int
    team_a: list[PlayerOut]
    team_b: list[PlayerOut]


class EventDetailOut(EventOut):
    responses: list[EventResponseOut]
    #: Members still to be heard from.
    unanswered: list[PlayerOut]
    selected: list[PlayerOut]
    #: A plan, never a result. These do not become matches on their own.
    matchups: list[EventMatchupOut]


class ResponseIn(BaseModel):
    state: str = Field(description=" | ".join(RESPONSE_STATES))


class SelectionIn(BaseModel):
    """The whole squad, written as one decision."""

    player_ids: list[str] = Field(default_factory=list, max_length=40)


class MatchupIn(BaseModel):
    round: int = Field(ge=1, le=20)
    court: int = Field(ge=1, le=10)
    team_a: list[str] = Field(min_length=2, max_length=2)
    team_b: list[str] = Field(min_length=2, max_length=2)

    @field_validator("team_b")
    @classmethod
    def _distinct(cls, value: list[str], info) -> list[str]:
        team_a = info.data.get("team_a") or []
        if len({*team_a, *value}) != len(team_a) + len(value):
            raise ValueError("En kamp skal have fire forskellige spillere.")
        return value


class MatchupsIn(BaseModel):
    """The whole plan, written as one decision."""

    matchups: list[MatchupIn] = Field(default_factory=list, max_length=60)

