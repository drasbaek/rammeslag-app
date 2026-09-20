"""Match persistence plus the bridge between the database and the rating engine.

This module is the only place that turns database rows into
:class:`MatchInput` values. Everything downstream (ladder, profiles, session
recaps) reads the :class:`ReplayView` built here, so there is exactly one
definition of "what the ratings are".

No FastAPI imports live in this file.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from rammeslag.db import new_id, utcnow
from rammeslag.modules.matches.models import ID_PREFIX, Match, MatchSet
from rammeslag.modules.rating.constants import SEED_RATING
from rammeslag.modules.rating.engine import (
    SET_A,
    SET_B,
    MatchInput,
    RatingResult,
    compute,
    observed_score,
    set_winner,
)
from rammeslag.modules.sessions.models import Session as PlaySession

if TYPE_CHECKING:  # pragma: no cover
    from rammeslag.modules.players.service import PlayerInfo as PlayerInfoLike
else:  # pragma: no cover
    PlayerInfoLike = object

INTERNAL = "internal"

WIN = "W"
LOSS = "L"
DRAW = "D"

TEAM_A = "A"
TEAM_B = "B"
TEAM_NONE = "D"


@dataclass(frozen=True)
class _AnonymousPlayer:
    """Stand-in when a player id has no row. Should not happen; never crashes."""

    id: str
    name: str = "Ukendt spiller"
    is_guest: bool = False
    entry_rating: float = SEED_RATING

    def __init__(self, player_id: str) -> None:
        object.__setattr__(self, "id", player_id)
        object.__setattr__(self, "name", "Ukendt spiller")
        object.__setattr__(self, "is_guest", False)
        object.__setattr__(self, "entry_rating", SEED_RATING)


class DomainError(Exception):
    """A rule violation with a message that is safe to show a player (Danish)."""

    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class NotFoundError(DomainError):
    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=404)


# --------------------------------------------------------------------------
# Plain row types. Pure functions below operate on these, never on ORM objects,
# which is what makes the interesting logic testable without a database.
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class MatchRow:
    id: str
    session_id: str
    played_at: datetime
    created_at: datetime
    source: str
    team_a: tuple[str, str]
    team_b: tuple[str, str]
    sets: tuple[tuple[int, int], ...]

    @property
    def games_a(self) -> int:
        return sum(s[0] for s in self.sets)

    @property
    def games_b(self) -> int:
        return sum(s[1] for s in self.sets)

    @property
    def player_ids(self) -> tuple[str, str, str, str]:
        return (*self.team_a, *self.team_b)

    def team_of(self, player_id: str) -> str | None:
        if player_id in self.team_a:
            return TEAM_A
        if player_id in self.team_b:
            return TEAM_B
        return None

    def partner_of(self, player_id: str) -> str | None:
        if player_id == self.team_a[0]:
            return self.team_a[1]
        if player_id == self.team_a[1]:
            return self.team_a[0]
        if player_id == self.team_b[0]:
            return self.team_b[1]
        if player_id == self.team_b[1]:
            return self.team_b[0]
        return None

    def opponents_of(self, player_id: str) -> tuple[str, str] | None:
        team = self.team_of(player_id)
        if team == TEAM_A:
            return self.team_b
        if team == TEAM_B:
            return self.team_a
        return None


@dataclass
class MatchView:
    """A match as the app shows it: named players, sets, verdicts, rating deltas."""

    id: str
    session_id: str
    played_at: datetime
    source: str
    team_a: list[PlayerInfoLike]
    team_b: list[PlayerInfoLike]
    sets: list[tuple[int, int, str]]
    games_a: int
    games_b: int
    winner: str
    deltas: dict[str, float] = field(default_factory=dict)


@dataclass(frozen=True)
class ReplayEntry:
    """One match as the engine saw it, enriched with the session it belongs to."""

    match_id: str
    session_id: str
    played_at: datetime
    ratings_after: dict[str, float]
    deltas: dict[str, float]


@dataclass
class ReplayView:
    """The full replay, indexed for the read models that need it."""

    final: dict[str, float] = field(default_factory=dict)
    matches_played: dict[str, int] = field(default_factory=dict)
    entries: list[ReplayEntry] = field(default_factory=list)
    # What each player was seeded at. A player who has never played still has
    # a rating: the one an admin gave them.
    entry_ratings: dict[str, float] = field(default_factory=dict)

    def rating_of(self, player_id: str) -> float:
        return self.final.get(player_id, self.entry_ratings.get(player_id, SEED_RATING))

    def index_of(self, match_id: str) -> int | None:
        for i, entry in enumerate(self.entries):
            if entry.match_id == match_id:
                return i
        return None

    def snapshot_after(self, index: int) -> dict[str, float]:
        """Ratings of every player who has appeared, after ``entries[index]``.

        ``index = -1`` yields an empty board: nobody has played yet.
        """
        snapshot: dict[str, float] = {}
        for entry in self.entries[: index + 1]:
            snapshot.update(entry.ratings_after)
        return snapshot

    def gain_between(self, start: datetime, end: datetime) -> dict[str, float]:
        """Rating gained inside ``[start, end]``. This is the season standing."""
        gains: dict[str, float] = {}
        for entry in self.entries:
            if entry.played_at < start or entry.played_at > end:
                continue
            for player_id, delta in entry.deltas.items():
                gains[player_id] = gains.get(player_id, 0.0) + delta
        return gains

    def curve_for(self, player_id: str) -> list[tuple[str, datetime, float]]:
        """Rating after each match the player took part in."""
        return [
            (entry.match_id, entry.played_at, entry.ratings_after[player_id])
            for entry in self.entries
            if player_id in entry.ratings_after
        ]

    def deltas_for_session(self, session_id: str) -> dict[str, float]:
        totals: dict[str, float] = {}
        for entry in self.entries:
            if entry.session_id != session_id:
                continue
            for player_id, delta in entry.deltas.items():
                totals[player_id] = totals.get(player_id, 0.0) + delta
        return totals

    def last_index_of_session(self, session_id: str) -> int | None:
        last: int | None = None
        for i, entry in enumerate(self.entries):
            if entry.session_id == session_id:
                last = i
        return last

    def first_index_of_session(self, session_id: str) -> int | None:
        for i, entry in enumerate(self.entries):
            if entry.session_id == session_id:
                return i
        return None

    def delta_for(self, match_id: str) -> dict[str, float]:
        for entry in self.entries:
            if entry.match_id == match_id:
                return entry.deltas
        return {}


def seed_rating(view: ReplayView, player_id: str) -> float:
    """The rating a player started from: their entry rating, or the seed."""
    return view.entry_ratings.get(player_id, SEED_RATING)


# --------------------------------------------------------------------------
# Pure helpers
# --------------------------------------------------------------------------


def match_verdict(sets: Sequence[tuple[int, int]]) -> str:
    """Who won the match: sets decide, games break a tie on sets.

    Delegates to the engine so the winner the app displays and the winner the
    rating pays out can never disagree. See docs/RATING.md.
    """
    score_a = observed_score(sets)
    if score_a == 1.0:
        return TEAM_A
    if score_a == 0.0:
        return TEAM_B
    return TEAM_NONE


def set_verdict(games_a: int, games_b: int) -> str:
    """Who won one set: a 2+ game lead, or 7-6. Neither side on a level set.

    The engine owns this rule now that sets decide the match, so this is a
    presentation of `rating.engine.set_winner`, not a second copy of it.
    """
    winner = set_winner(games_a, games_b)
    if winner == SET_A:
        return TEAM_A
    if winner == SET_B:
        return TEAM_B
    return TEAM_NONE


def player_verdict(row: MatchRow, player_id: str) -> str:
    """W / L / D for one player in one match."""
    team = row.team_of(player_id)
    if team is None:
        raise ValueError(f"{player_id} did not play in {row.id}")
    winner = match_verdict(row.sets)
    if winner == TEAM_NONE:
        return DRAW
    return WIN if winner == team else LOSS


def sort_key(row: MatchRow) -> tuple[datetime, str]:
    """Chronological by played_at, ties broken by match id.

    Same ordering the engine applies internally (docs/RATING.md), so the
    replay history and every derived view agree on what "the last match" is.
    """
    return (row.played_at, row.id)


def sorted_rows(rows: Iterable[MatchRow]) -> list[MatchRow]:
    return sorted(rows, key=sort_key)


def internal_rows(rows: Iterable[MatchRow]) -> list[MatchRow]:
    """Only internal matches reach the engine. RankedIN data is display-only."""
    return [row for row in rows if row.source == INTERNAL]


def to_match_inputs(rows: Iterable[MatchRow]) -> list[MatchInput]:
    return [
        MatchInput(
            match_id=row.id,
            played_at=row.played_at,
            team_a=row.team_a,
            team_b=row.team_b,
            sets=row.sets,
        )
        for row in sorted_rows(internal_rows(rows))
    ]


def build_replay_view(
    result: RatingResult,
    rows: Sequence[MatchRow],
    entry_ratings: Mapping[str, float] | None = None,
) -> ReplayView:
    """Attach session ids to the engine's history. Pure; no database."""
    session_by_match = {row.id: row.session_id for row in rows}
    entries = [
        ReplayEntry(
            match_id=delta.match_id,
            session_id=session_by_match.get(delta.match_id, ""),
            played_at=delta.played_at,
            ratings_after=dict(delta.ratings_after),
            deltas=dict(delta.deltas),
        )
        for delta in result.history
    ]
    return ReplayView(
        final=dict(result.final),
        matches_played=dict(result.matches_played),
        entries=entries,
        entry_ratings=dict(entry_ratings or {}),
    )


def replay_rows(
    rows: Sequence[MatchRow], entry_ratings: Mapping[str, float] | None = None
) -> ReplayView:
    """Full replay from plain rows. The one entry point every read model uses.

    ``entry_ratings`` is every known player's admin-set starting rating; the
    engine falls back to SEED_RATING for anyone absent.
    """
    ordered = sorted_rows(internal_rows(rows))
    seeds = dict(entry_ratings or {})
    result = compute(to_match_inputs(ordered), seeds)
    return build_replay_view(result, ordered, seeds)


def form_for(rows: Sequence[MatchRow], player_id: str, limit: int = 5) -> list[str]:
    """Last ``limit`` verdicts for a player, most recent last."""
    played = [row for row in sorted_rows(internal_rows(rows)) if row.team_of(player_id)]
    return [player_verdict(row, player_id) for row in played[-limit:]]


def record_for(rows: Sequence[MatchRow], player_id: str) -> tuple[int, int, int]:
    """(wins, losses, draws) over the given rows."""
    wins = losses = draws = 0
    for row in internal_rows(rows):
        if not row.team_of(player_id):
            continue
        verdict = player_verdict(row, player_id)
        if verdict == WIN:
            wins += 1
        elif verdict == LOSS:
            losses += 1
        else:
            draws += 1
    return wins, losses, draws


def rows_within(rows: Sequence[MatchRow], start: datetime, end: datetime) -> list[MatchRow]:
    return [row for row in rows if start <= row.played_at <= end]


def day_bounds(starts_on: date, ends_on: date) -> tuple[datetime, datetime]:
    """Inclusive season dates -> an inclusive UTC instant window."""
    start = datetime(starts_on.year, starts_on.month, starts_on.day, tzinfo=UTC)
    end = datetime(ends_on.year, ends_on.month, ends_on.day, 23, 59, 59, 999999, tzinfo=UTC)
    return start, end


def players_in(rows: Iterable[MatchRow]) -> set[str]:
    found: set[str] = set()
    for row in rows:
        found.update(row.player_ids)
    return found


def rank_by(
    values: dict[str, float], tiebreak: dict[str, str] | None = None
) -> dict[str, int]:
    """Dense-free competition ranking: equal values share a rank, then a gap.

    ``tiebreak`` maps player id to a stable string (the name) so that the order
    of equal entries does not depend on dict iteration order.
    """
    names = tiebreak or {}
    ordered = sorted(values.items(), key=lambda kv: (-kv[1], names.get(kv[0], kv[0])))
    ranks: dict[str, int] = {}
    previous_value: float | None = None
    previous_rank = 0
    for position, (player_id, value) in enumerate(ordered, start=1):
        if previous_value is not None and abs(value - previous_value) < 1e-9:
            ranks[player_id] = previous_rank
        else:
            ranks[player_id] = position
            previous_rank = position
            previous_value = value
    return ranks


# --------------------------------------------------------------------------
# Database access
# --------------------------------------------------------------------------


def build_match_views(
    rows: Sequence[MatchRow],
    players: dict[str, PlayerInfoLike],
    view: ReplayView,
) -> list[MatchView]:
    """Presentation model for a list of matches. Pure; no database."""

    def info(player_id: str) -> PlayerInfoLike:
        found = players.get(player_id)
        return found if found is not None else _AnonymousPlayer(player_id)

    return [
        MatchView(
            id=row.id,
            session_id=row.session_id,
            played_at=row.played_at,
            source=row.source,
            team_a=[info(pid) for pid in row.team_a],
            team_b=[info(pid) for pid in row.team_b],
            sets=[(a, b, set_verdict(a, b)) for a, b in row.sets],
            games_a=row.games_a,
            games_b=row.games_b,
            winner=match_verdict(row.sets),
            deltas={pid: round(d, 1) for pid, d in view.delta_for(row.id).items()},
        )
        for row in sorted_rows(rows)
    ]


def to_row(match: Match) -> MatchRow:
    return MatchRow(
        id=match.id,
        session_id=match.session_id,
        played_at=match.played_at,
        created_at=match.created_at,
        source=match.source,
        team_a=(match.team_a_player1_id, match.team_a_player2_id),
        team_b=(match.team_b_player1_id, match.team_b_player2_id),
        sets=tuple((s.games_a, s.games_b) for s in sorted(match.sets, key=lambda s: s.set_number)),
    )


def load_rows(db: DbSession) -> list[MatchRow]:
    """Every match in the database, chronologically ordered."""
    matches = db.execute(select(Match)).scalars().unique().all()
    return sorted_rows(to_row(m) for m in matches)


def load_entry_ratings(db: DbSession) -> dict[str, float]:
    from rammeslag.modules.players.models import Player  # local: avoids an import cycle

    return dict(db.execute(select(Player.id, Player.entry_rating)).all())


def replay(db: DbSession) -> ReplayView:
    """Full replay of every internal match. Single-digit milliseconds at this size."""
    return replay_rows(load_rows(db), load_entry_ratings(db))


def get_match(db: DbSession, match_id: str) -> Match:
    match = db.get(Match, match_id)
    if match is None:
        raise NotFoundError("Kampen findes ikke.")
    return match


# The engine trusts its input and computes (docs/RATING.md, "Validation is the
# caller's job"). These four rules are enforced here, before anything is
# written, so nothing invalid can ever reach a replay.
MAX_SETS = 3
MAX_GAMES_PER_SET = 30


def validate_teams(team_a: Sequence[str], team_b: Sequence[str]) -> None:
    if len(team_a) != 2 or len(team_b) != 2:
        raise DomainError("Hvert hold skal have præcis to spillere.")
    if len({*team_a, *team_b}) != 4:
        raise DomainError("En kamp skal have fire forskellige spillere.")


def validate_sets(sets: Sequence[tuple[int, int]]) -> None:
    if not sets:
        raise DomainError("En kamp skal have mindst ét sæt.")
    if len(sets) > MAX_SETS:
        raise DomainError("En kamp kan højst have tre sæt.")
    for games_a, games_b in sets:
        if games_a < 0 or games_b < 0:
            raise DomainError("Antal partier kan ikke være negativt.")
        if games_a > MAX_GAMES_PER_SET or games_b > MAX_GAMES_PER_SET:
            raise DomainError("Antal partier ser forkert ud.")
    if sum(a + b for a, b in sets) == 0:
        raise DomainError("En kamp skal have mindst ét spillet parti.")


#: Time of day a backfilled session's first match is anchored to. The real
#: history runs roughly 16:30-20:40 UTC, so an evening default keeps new
#: sessions in the same band as imported ones.
SESSION_ANCHOR_HOUR = 18


def next_played_at(db: DbSession, played_on: date, now: datetime) -> datetime:
    """The timestamp for the next match on ``played_on``.

    Anchored to the SESSION'S OWN DATE, not the clock. A session recorded
    days after it was played must still replay in the position it was played
    -- ratings are a chronological replay, so stamping a backfilled evening
    with today's time would compute the ladder in the order results were
    typed rather than the order they happened.

    Within a day, each match lands one second after the last, so six matches
    on one evening replay in the order they were entered. ``match_id`` is only
    a weak tie-break (docs/RATING.md), so two matches must never share a
    timestamp, and a clock that has not moved between two quick submissions
    must not decide the order by accident.

    The window is the whole calendar day rather than the session, so two
    sessions on one date (a training and a casual game) still order correctly
    against each other.
    """
    day_start = datetime.combine(played_on, time.min, tzinfo=UTC)
    day_end = day_start + timedelta(days=1)
    latest = db.execute(
        select(func.max(Match.played_at)).where(
            Match.played_at >= day_start, Match.played_at < day_end
        )
    ).scalar_one_or_none()
    if latest is None:
        anchor = day_start + timedelta(hours=SESSION_ANCHOR_HOUR)
        # A session recorded live should not be stamped in its own future.
        return min(anchor, now) if day_start <= now < day_end else anchor
    if latest.tzinfo is None:
        latest = latest.replace(tzinfo=UTC)
    return latest + timedelta(seconds=1)


def create_match(
    db: DbSession,
    *,
    session_id: str,
    team_a: Sequence[str],
    team_b: Sequence[str],
    sets: Sequence[tuple[int, int]],
    played_at: datetime | None = None,
    source: str = INTERNAL,
    created_by: str | None = None,
) -> Match:
    """Write one match.

    ``played_at`` defaults to now and the HTTP layer never forwards a
    client-supplied value; only scripts/import_history.py passes the original
    historical timestamp.
    """
    play_session = db.get(PlaySession, session_id)
    if play_session is None:
        raise NotFoundError("Sessionen findes ikke.")
    if play_session.status == "closed":
        raise DomainError("Sessionen er lukket, så der kan ikke tilføjes flere kampe.")

    validate_teams(team_a, team_b)
    validate_sets(sets)

    from rammeslag.modules.players.models import Player  # local: avoids an import cycle

    known = set(
        db.execute(select(Player.id).where(Player.id.in_(list(team_a) + list(team_b))))
        .scalars()
        .all()
    )
    missing = [pid for pid in [*team_a, *team_b] if pid not in known]
    if missing:
        raise DomainError("En eller flere spillere findes ikke.")

    match = Match(
        id=new_id(ID_PREFIX),
        session_id=session_id,
        # Stamped at entry time. match_id is only a weak tie-break, so two
        # matches in the same session must not share a timestamp.
        played_at=played_at or next_played_at(db, play_session.played_on, utcnow()),
        source=source,
        team_a_player1_id=team_a[0],
        team_a_player2_id=team_a[1],
        team_b_player1_id=team_b[0],
        team_b_player2_id=team_b[1],
        created_by=created_by,
    )
    for number, (games_a, games_b) in enumerate(sets, start=1):
        match.sets.append(
            MatchSet(
                id=f"{match.id}-s{number}",
                set_number=number,
                games_a=games_a,
                games_b=games_b,
            )
        )
    db.add(match)
    db.commit()
    return match


def delete_match(db: DbSession, match_id: str) -> ReplayView:
    """Delete a match and recompute from scratch.

    Never an inverse update: the whole history is replayed, which is why
    deletion is correct by construction.
    """
    match = get_match(db, match_id)
    db.delete(match)
    db.commit()
    return replay(db)


__all__ = [
    "DRAW",
    "INTERNAL",
    "LOSS",
    "TEAM_A",
    "TEAM_B",
    "TEAM_NONE",
    "WIN",
    "DomainError",
    "MatchRow",
    "MatchView",
    "NotFoundError",
    "ReplayEntry",
    "ReplayView",
    "build_match_views",
    "build_replay_view",
    "create_match",
    "day_bounds",
    "delete_match",
    "form_for",
    "get_match",
    "load_entry_ratings",
    "load_rows",
    "match_verdict",
    "next_played_at",
    "player_verdict",
    "players_in",
    "rank_by",
    "record_for",
    "replay",
    "replay_rows",
    "rows_within",
    "set_verdict",
    "sorted_rows",
    "to_match_inputs",
    "to_row",
    "validate_sets",
    "validate_teams",
]
