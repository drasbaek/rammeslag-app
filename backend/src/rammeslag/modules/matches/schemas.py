"""Match wire shapes."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from rammeslag.modules.players.schemas import PlayerOut


class SetIn(BaseModel):
    games_a: int = Field(ge=0, le=30)
    games_b: int = Field(ge=0, le=30)


class MatchCreate(BaseModel):
    session_id: str
    team_a: list[str] = Field(min_length=2, max_length=2)
    team_b: list[str] = Field(min_length=2, max_length=2)
    sets: list[SetIn] = Field(min_length=1, max_length=3)
    # played_at is deliberately NOT accepted from the client: the matches
    # module stamps it at entry time so matches inside one session replay in
    # the order they were played. See docs/RATING.md, "Inputs".

    @field_validator("team_b")
    @classmethod
    def _distinct(cls, value: list[str], info) -> list[str]:
        team_a = info.data.get("team_a") or []
        if len({*team_a, *value}) != len(team_a) + len(value):
            raise ValueError("En kamp skal have fire forskellige spillere.")
        return value


class SetOut(BaseModel):
    set_number: int
    games_a: int
    games_b: int
    # Display-only verdict: "A", "B" or "D". Never feeds the rating.
    winner: str


class MatchOut(BaseModel):
    id: str
    session_id: str
    played_at: datetime
    source: str
    team_a: list[PlayerOut]
    team_b: list[PlayerOut]
    sets: list[SetOut]
    games_a: int
    games_b: int
    winner: str
    deltas: dict[str, float] = {}


def player_out(info: object) -> PlayerOut:
    """Serialise a ``players.service.PlayerInfo``. Duck-typed for the same reason."""
    return PlayerOut(
        id=info.id,  # type: ignore[attr-defined]
        name=info.name,  # type: ignore[attr-defined]
        is_guest=info.is_guest,  # type: ignore[attr-defined]
        entry_rating=info.entry_rating,  # type: ignore[attr-defined]
    )


def match_out(view: object) -> MatchOut:
    """Serialise a ``matches.service.MatchView``. Duck-typed to avoid importing
    a service module from a schema module."""
    return MatchOut(
        id=view.id,  # type: ignore[attr-defined]
        session_id=view.session_id,  # type: ignore[attr-defined]
        played_at=view.played_at,  # type: ignore[attr-defined]
        source=view.source,  # type: ignore[attr-defined]
        team_a=[player_out(p) for p in view.team_a],  # type: ignore[attr-defined]
        team_b=[player_out(p) for p in view.team_b],  # type: ignore[attr-defined]
        sets=[
            SetOut(set_number=i, games_a=a, games_b=b, winner=w)
            for i, (a, b, w) in enumerate(view.sets, start=1)  # type: ignore[attr-defined]
        ],
        games_a=view.games_a,  # type: ignore[attr-defined]
        games_b=view.games_b,  # type: ignore[attr-defined]
        winner=view.winner,  # type: ignore[attr-defined]
        deltas=view.deltas,  # type: ignore[attr-defined]
    )
