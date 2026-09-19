"""Session logic and the post-session recap. No FastAPI imports."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from rammeslag.db import new_id
from rammeslag.modules.matches import service as match_service
from rammeslag.modules.matches.models import Match
from rammeslag.modules.matches.service import (
    DomainError,
    MatchRow,
    MatchView,
    NotFoundError,
    ReplayView,
    build_match_views,
    internal_rows,
    players_in,
    rows_within,
)
from rammeslag.modules.players.service import PlayerInfo
from rammeslag.modules.seasons import service as season_service
from rammeslag.modules.sessions.models import (
    ID_PREFIX,
    SESSION_STATUSES,
    SESSION_TYPES,
)
from rammeslag.modules.sessions.models import (
    Session as PlaySession,
)


@dataclass
class PlayerDelta:
    player_id: str
    name: str
    delta: float
    rating: float


@dataclass
class Recap:
    """What the group chat actually wants to see the morning after."""

    biggest_riser: PlayerDelta | None = None
    biggest_faller: PlayerDelta | None = None
    # Last place gets the bundprop treatment. Affectionate, always.
    bundprop: PlayerDelta | None = None


@dataclass
class SessionDetail:
    id: str
    season_id: str
    season_name: str
    played_on: date
    type: str
    status: str
    note: str | None
    matches: list[MatchView] = field(default_factory=list)
    recap: Recap = field(default_factory=Recap)


# --------------------------------------------------------------------------
# Pure read models
# --------------------------------------------------------------------------


def build_recap(
    rows: Sequence[MatchRow],
    view: ReplayView,
    players: dict[str, PlayerInfo],
    session_id: str,
    *,
    season_window: tuple[datetime, datetime] | None = None,
) -> Recap:
    """Biggest riser, biggest faller and the bundprop for one session.

    The bundprop is the lowest-rated *active* player as the board stood right
    after this session -- not today. A recap is a snapshot of that evening.
    """
    deltas = view.deltas_for_session(session_id)
    last_index = view.last_index_of_session(session_id)
    if last_index is None:
        return Recap()

    ratings_after = view.snapshot_after(last_index)

    def name_of(player_id: str) -> str:
        info = players.get(player_id)
        return info.name if info else player_id

    def as_delta(player_id: str) -> PlayerDelta:
        return PlayerDelta(
            player_id=player_id,
            name=name_of(player_id),
            delta=round(deltas.get(player_id, 0.0), 1),
            rating=round(ratings_after.get(player_id, view.rating_of(player_id)), 1),
        )

    riser = faller = None
    if deltas:
        top = max(deltas.items(), key=lambda kv: (kv[1], name_of(kv[0])))
        bottom = min(deltas.items(), key=lambda kv: (kv[1], name_of(kv[0])))
        riser = as_delta(top[0]) if top[1] > 0 else None
        faller = as_delta(bottom[0]) if bottom[1] < 0 else None

    # Active, as of that evening: anyone who has played in the same season up
    # to and including this session.
    session_end = view.entries[last_index].played_at
    played_so_far = [row for row in internal_rows(rows) if row.played_at <= session_end]
    if season_window is not None:
        start, _ = season_window
        played_so_far = rows_within(played_so_far, start, session_end)
    active = players_in(played_so_far)

    bundprop = None
    candidates = {pid: ratings_after[pid] for pid in active if pid in ratings_after}
    if candidates:
        worst = min(candidates.items(), key=lambda kv: (kv[1], name_of(kv[0])))
        bundprop = as_delta(worst[0])

    return Recap(biggest_riser=riser, biggest_faller=faller, bundprop=bundprop)


# --------------------------------------------------------------------------
# Database-backed entry points
# --------------------------------------------------------------------------


def list_sessions(db: DbSession, season_id: str | None = None) -> list[tuple[PlaySession, int]]:
    """Sessions newest first, each with its match count."""
    counts = dict(
        db.execute(select(Match.session_id, func.count(Match.id)).group_by(Match.session_id)).all()
    )
    stmt = select(PlaySession)
    if season_id:
        stmt = stmt.where(PlaySession.season_id == season_id)
    sessions = (
        db.execute(stmt.order_by(PlaySession.played_on.desc(), PlaySession.id)).scalars().all()
    )
    return [(s, counts.get(s.id, 0)) for s in sessions]


def get_session(db: DbSession, session_id: str) -> PlaySession:
    play_session = db.get(PlaySession, session_id)
    if play_session is None:
        raise NotFoundError("Sessionen findes ikke.")
    return play_session


def create_session(
    db: DbSession,
    *,
    played_on: date,
    type: str = "training",
    note: str | None = None,
    created_by: str | None = None,
) -> PlaySession:
    if type not in SESSION_TYPES:
        raise DomainError("Ukendt sessionstype.")
    season = season_service.resolve_season_for_session(db, played_on)
    play_session = PlaySession(
        id=new_id(ID_PREFIX),
        season_id=season.id,
        played_on=played_on,
        type=type,
        status="open",
        note=note,
        created_by=created_by,
    )
    db.add(play_session)
    db.commit()
    return play_session


def set_status(db: DbSession, session_id: str, status: str) -> PlaySession:
    if status not in SESSION_STATUSES:
        raise DomainError("Ukendt status.")
    play_session = get_session(db, session_id)
    play_session.status = status
    db.commit()
    return play_session


def close_session(db: DbSession, session_id: str) -> PlaySession:
    return set_status(db, session_id, "closed")


def delete_session(db: DbSession, session_id: str) -> ReplayView:
    """Delete a session and its matches, then recompute the whole history."""
    play_session = get_session(db, session_id)
    for match in db.execute(select(Match).where(Match.session_id == session_id)).scalars().all():
        db.delete(match)
    db.delete(play_session)
    db.commit()
    return match_service.replay(db)


def get_detail(db: DbSession, session_id: str) -> SessionDetail:
    from rammeslag.modules.players.service import player_index

    play_session = get_session(db, session_id)
    season = season_service.get_season(db, play_session.season_id)
    rows = match_service.load_rows(db)
    view = match_service.replay_rows(rows, match_service.load_entry_ratings(db))
    players = player_index(db)
    session_rows = [row for row in rows if row.session_id == session_id]
    window = match_service.day_bounds(season.starts_on, season.ends_on)
    return SessionDetail(
        id=play_session.id,
        season_id=season.id,
        season_name=season.name,
        played_on=play_session.played_on,
        type=play_session.type,
        status=play_session.status,
        note=play_session.note,
        matches=build_match_views(session_rows, players, view),
        recap=build_recap(rows, view, players, session_id, season_window=window),
    )


__all__ = [
    "PlayerDelta",
    "Recap",
    "SessionDetail",
    "build_recap",
    "close_session",
    "create_session",
    "delete_session",
    "get_detail",
    "get_session",
    "list_sessions",
    "set_status",
]
