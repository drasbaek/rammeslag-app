"""Player, ladder, profile and auth wire shapes."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from rammeslag.modules.seasons.schemas import SeasonRef


class PlayerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    is_guest: bool
    entry_rating: float


class PlayerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    # Required. An admin judges where a new player enters an established field.
    entry_rating: float = Field(ge=0, le=5000)
    is_guest: bool = False
    is_admin: bool = False
    pin: str | None = Field(default=None, min_length=4, max_length=64)


class GuestCreate(BaseModel):
    """A guest, added by whoever is bringing them along.

    No entry rating and no PIN: a guest enters at the seed because nobody has
    judged them yet, and a guest never logs in. Both are an admin's to correct
    later on the player screen.
    """

    name: str = Field(min_length=1, max_length=120)


class PlayerUpdate(BaseModel):
    """Every field optional. Flipping ``is_guest`` promotes a guest to a member."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    is_guest: bool | None = None
    entry_rating: float | None = Field(default=None, ge=0, le=5000)
    is_admin: bool | None = None
    pin: str | None = Field(default=None, min_length=4, max_length=64)


class MeOut(PlayerOut):
    is_admin: bool


class LoginRequest(BaseModel):
    player_id: str
    pin: str = Field(min_length=4, max_length=64)


class LadderEntryOut(BaseModel):
    rank: int
    player_id: str
    name: str
    is_guest: bool
    rating: float
    rating_gained: float
    matches_played: int
    career_matches: int
    wins: int
    losses: int
    draws: int
    career_wins: int
    career_losses: int
    career_draws: int
    form: list[str]
    active: bool
    provisional: bool = False
    previous_rank: int | None = None
    movement: int | None = None


class LadderOut(BaseModel):
    """One list ranked 1..n, members only unless ``includes_guests``.

    ``threshold`` is the career match count below which an entry is flagged
    ``provisional``: still ranked, but the rating is still settling.
    ``guest_count`` is how many guests this response left out, so the filter
    toggle can say what it would add.
    """

    # "season" ranks by rating gained inside the window; "all" by absolute rating.
    mode: str
    season: SeasonRef | None = None
    threshold: int
    includes_guests: bool
    guest_count: int = 0
    entries: list[LadderEntryOut]


class PairStatOut(BaseModel):
    player_id: str
    name: str
    matches: int
    wins: int
    losses: int
    draws: int
    win_rate: float


class SeasonStatOut(BaseModel):
    season_id: str
    name: str
    matches: int
    wins: int
    losses: int
    draws: int
    rating_gained: float
    # Among members; ``rank_with_guests`` counts everyone who played.
    rank: int | None = None
    rank_with_guests: int | None = None


class CurvePoint(BaseModel):
    match_id: str
    played_at: datetime
    rating: float


class HighlightsOut(BaseModel):
    """Playful stats. Every entry carries its own sample size in ``matches``."""

    best_partner: PairStatOut | None = None
    worst_partner: PairStatOut | None = None
    favourite_victim: PairStatOut | None = None
    nemesis: PairStatOut | None = None
    most_played_partner: PairStatOut | None = None
    most_played_opponent: PairStatOut | None = None
    min_sample: int


class ProfileOut(BaseModel):
    player: PlayerOut
    rating: float
    start_rating: float
    # Placing among members -- None for a guest, who is not on the team's
    # ladder. ``rank_with_guests`` places them in the whole field.
    rank: int | None = None
    rank_with_guests: int | None = None
    matches_played: int
    wins: int
    losses: int
    draws: int
    form: list[str]
    active: bool
    curve: list[CurvePoint]
    seasons: list[SeasonStatOut]
    partners: list[PairStatOut]
    opponents: list[PairStatOut]
    highlights: HighlightsOut
