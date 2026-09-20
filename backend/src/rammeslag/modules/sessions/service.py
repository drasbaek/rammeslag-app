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
class PlannedGame:
    """One kamp off the training's whiteboard, and the result typed in for it.

    ``match_id`` is None until somebody enters the score. That is the whole
    state this feature has: an evening is done when every planned kamp has a
    match, and until then it is a list of things still to type in.
    """

    round: int
    court: int
    team_a: list[PlayerInfo]
    team_b: list[PlayerInfo]
    match_id: str | None = None


@dataclass
class SessionDetail:
    id: str
    season_id: str
    season_name: str
    played_on: date
    type: str
    status: str
    note: str | None
    #: The training this evening was planned as, when there is one. Everything
    #: imported from the old spreadsheet has none.
    event_id: str | None = None
    matches: list[MatchView] = field(default_factory=list)
    planned: list[PlannedGame] = field(default_factory=list)
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


#: A kamp as either side wrote it: the two pairs, without a home end. The plan
#: says Klaus & Jonas mod Anders & Mads; whoever types the score in may well
#: put the other two first, and it is the same kamp.
Pairing = frozenset[frozenset[str]]


def pairing_of(team_a: Sequence[str], team_b: Sequence[str]) -> Pairing:
    return frozenset({frozenset(team_a), frozenset(team_b)})


def pair_plan(
    planned: Sequence[tuple[Sequence[str], Sequence[str]]],
    played: Sequence[tuple[str, Sequence[str], Sequence[str]]],
) -> list[str | None]:
    """Which saved match answers which planned kamp. Pure, ids only.

    Matched on the two pairs rather than on an id, because nothing links them:
    a plan is a whiteboard and the score is an ordinary kamp typed into the
    evening. Sides may be swapped and a plan may repeat the same four people
    in a later round, so each match is consumed once and the rounds are read
    in order -- the first planned kamp with a given line-up gets the first
    result with it.

    Anything played that was never planned is simply not here. That is the
    kamp somebody added on the night, and it counts like any other.
    """
    used: set[str] = set()
    answers: list[str | None] = []
    for team_a, team_b in planned:
        want = pairing_of(team_a, team_b)
        found = next(
            (
                match_id
                for match_id, side_a, side_b in played
                if match_id not in used and pairing_of(side_a, side_b) == want
            ),
            None,
        )
        if found is not None:
            used.add(found)
        answers.append(found)
    return answers


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
    season_id: str | None = None,
) -> PlaySession:
    """Start an evening. The season follows from the date unless one is given.

    A caller that already holds a resolved season hands it over: a training
    resolved its own when its date was set, and re-deriving it here would let
    a season edited afterwards make the evening unopenable -- with a message
    about dates, on a screen about kampe.
    """
    if type not in SESSION_TYPES:
        raise DomainError("Ukendt sessionstype.")
    season = (
        season_service.get_season(db, season_id)
        if season_id is not None
        else season_service.resolve_season_for_session(db, played_on)
    )
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


def update_session(
    db: DbSession,
    session_id: str,
    *,
    played_on: date | None = None,
    type: str | None = None,
    note: str | None = None,
) -> PlaySession:
    """Edit an evening. An omitted field is left alone; an empty note clears it.

    Moving the date moves the matches with it. Ratings are a chronological
    replay keyed on ``matches.played_at``, so an evening re-dated to March that
    left its matches stamped in September would be listed in one place and
    computed in another. The whole session shifts by the same number of days,
    which keeps the order the matches were played in within the evening.

    Nothing is recomputed here and nothing needs to be: every rating in this
    app is replayed from the matches on read.
    """
    play_session = get_session(db, session_id)

    # Everything that can be refused is refused before anything is written: a
    # half-applied edit that moved the type but not the date would be worse
    # than no edit at all.
    if type is not None and type not in SESSION_TYPES:
        raise DomainError("Ukendt sessionstype.")
    moving = played_on is not None and played_on != play_session.played_on
    season = season_service.resolve_season_for_session(db, played_on) if moving else None

    if type is not None:
        play_session.type = type
    if note is not None:
        play_session.note = note.strip() or None
    if moving and season is not None and played_on is not None:
        shift = played_on - play_session.played_on
        matches = db.execute(select(Match).where(Match.session_id == session_id)).scalars().all()
        for match in matches:
            match.played_at = match.played_at + shift
        play_session.played_on = played_on
        play_session.season_id = season.id

    db.commit()
    return play_session


def planned_games(db: DbSession, session_id: str) -> tuple[str | None, list[PlannedGame]]:
    """The evening's plan, each kamp carrying the result typed in for it.

    Empty for everything that was not planned as a training -- the old
    spreadsheet's evenings, and any session whose training has no kampe set.
    The plan is read, never written: this is the one place the two halves meet
    and it meets them over player ids.
    """
    from rammeslag.modules.events import service as event_service

    event_id, matchups = event_service.plan_for_session(db, session_id)
    if event_id is None or not matchups:
        return event_id, []

    rows = (
        db.execute(
            select(Match)
            .where(Match.session_id == session_id)
            .order_by(Match.played_at, Match.id)
        )
        .scalars()
        .all()
    )
    played = [(row.id, row.player_ids[:2], row.player_ids[2:]) for row in rows]
    answers = pair_plan(
        [([p.id for p in m.team_a], [p.id for p in m.team_b]) for m in matchups], played
    )
    return event_id, [
        PlannedGame(
            round=matchup.round,
            court=matchup.court,
            team_a=matchup.team_a,
            team_b=matchup.team_b,
            match_id=match_id,
        )
        for matchup, match_id in zip(matchups, answers, strict=True)
    ]


def plan_counts(db: DbSession, session_ids: Sequence[str]) -> dict[str, tuple[str, int]]:
    """``session_id -> (event_id, planned kampe)`` for the history list."""
    from rammeslag.modules.events import service as event_service

    return event_service.plan_counts_for_sessions(db, session_ids)


def set_status(db: DbSession, session_id: str, status: str) -> PlaySession:
    if status not in SESSION_STATUSES:
        raise DomainError("Ukendt status.")
    play_session = get_session(db, session_id)
    play_session.status = status
    db.commit()
    return play_session


def close_session(db: DbSession, session_id: str) -> PlaySession:
    """Close the evening. Only once every planned kamp has a score.

    Closing is what turns an evening into the morning-after report, and a
    report missing two of six kampe is a wrong report rather than a partial
    one: the riser, the faller and the bundprop are all sums over kampe that
    have not all been played. Nothing stops the scores arriving one at a time
    from four different phones -- that is the point -- but the evening stays
    open until the last one is in.

    An evening with no plan behind it closes whenever somebody says so. There
    is nothing to be missing.
    """
    _, planned = planned_games(db, session_id)
    missing = sum(1 for game in planned if game.match_id is None)
    if missing == 1:
        raise DomainError("Der mangler resultatet på én planlagt kamp.")
    if missing > 1:
        raise DomainError(f"Der mangler resultater på {missing} planlagte kampe.")
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
    event_id, planned = planned_games(db, session_id)
    return SessionDetail(
        id=play_session.id,
        season_id=season.id,
        season_name=season.name,
        played_on=play_session.played_on,
        type=play_session.type,
        status=play_session.status,
        note=play_session.note,
        event_id=event_id,
        matches=build_match_views(session_rows, players, view),
        planned=planned,
        recap=build_recap(rows, view, players, session_id, season_window=window),
    )


__all__ = [
    "PlannedGame",
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
    "pair_plan",
    "pairing_of",
    "plan_counts",
    "planned_games",
    "set_status",
    "update_session",
]
