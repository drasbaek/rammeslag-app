"""Event logic: who is coming, who is picked, and what is planned.

No FastAPI imports. Nothing in this file writes a ``Match`` or a ``MatchSet``,
which is what keeps the rating engine -- and ``fixtures/expected_ratings.json``
-- out of reach of the whole feature.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from rammeslag.db import new_id, utcnow
from rammeslag.modules.events.models import (
    COURT_CAPACITY,
    DEFAULT_SQUAD_SIZE,
    DEFAULT_TRAINING_COURTS,
    EVENT_STATUSES,
    EVENT_TYPES,
    ID_PREFIX,
    RESPONSE_STATES,
    Event,
    EventMatchup,
    EventResponse,
    EventSelection,
)
from rammeslag.modules.matches.service import DomainError, NotFoundError
from rammeslag.modules.players.models import Player
from rammeslag.modules.players.service import PlayerInfo, player_index
from rammeslag.modules.seasons import service as season_service
from rammeslag.modules.sessions import service as session_service
from rammeslag.modules.sessions.models import Session as PlaySession

MATCH = "match"
TRAINING = "training"

YES = "yes"
NO = "no"
MAYBE = "maybe"

OPEN = "open"
LOCKED = "locked"
CANCELLED = "cancelled"

#: Everything a player reads is Danish and hardcoded; the clock the team plays
#: on is Copenhagen's. "Is this event still upcoming" must not flip over at
#: 01:00 local time because the server thinks in UTC.
COPENHAGEN = ZoneInfo("Europe/Copenhagen")

MAX_CAPACITY = 40
MAX_ROUNDS = 20
MAX_COURTS = 10


def today(now: datetime | None = None) -> date:
    """The current date in Copenhagen."""
    moment = now.astimezone(COPENHAGEN) if now is not None else datetime.now(COPENHAGEN)
    return moment.date()


# --------------------------------------------------------------------------
# Read models. Plain dataclasses, so the router serialises and nothing else
# has to know about ORM objects.
# --------------------------------------------------------------------------


@dataclass
class ResponseView:
    player: PlayerInfo
    state: str
    added_by: str | None
    updated_at: datetime


@dataclass
class MatchupView:
    round: int
    court: int
    team_a: list[PlayerInfo]
    team_b: list[PlayerInfo]


@dataclass
class EventCounts:
    yes: int = 0
    no: int = 0
    maybe: int = 0
    #: Members with no row at all. Guests are never counted here: nobody asked
    #: them, so their silence is not an unanswered question.
    unanswered: int = 0


@dataclass
class EventView:
    id: str
    season_id: str
    season_name: str
    type: str
    held_on: date
    start_time: time
    venue: str
    opponent: str | None
    capacity: int
    status: str
    note: str | None
    session_id: str | None
    counts: EventCounts
    selected_count: int
    #: The caller's own answer, or None. Null for a logged-out reader too --
    #: the screen shows the grid either way and only hides the toggle.
    my_state: str | None = None

    @property
    def surplus(self) -> int:
        """Available minus needed. The old sheet's bottom row, exactly.

        Positive is spare players, negative is a hole to fill. "Ved ikke" does
        not count -- a maybe never filled a court.
        """
        return self.counts.yes - self.capacity


@dataclass
class EventDetail:
    event: EventView
    responses: list[ResponseView] = field(default_factory=list)
    #: Members who have not answered. The sheet showed them as a blank cell;
    #: the app shows them as a list, because chasing them is the point.
    unanswered: list[PlayerInfo] = field(default_factory=list)
    selected: list[PlayerInfo] = field(default_factory=list)
    matchups: list[MatchupView] = field(default_factory=list)


# --------------------------------------------------------------------------
# Pure helpers
# --------------------------------------------------------------------------


def default_capacity(type: str) -> int:
    """Six for a fixture, three courts' worth for a training."""
    if type == MATCH:
        return DEFAULT_SQUAD_SIZE
    return DEFAULT_TRAINING_COURTS * COURT_CAPACITY


def courts_for(capacity: int) -> int:
    """Capacity back into baner, rounded up. Display only."""
    return (capacity + COURT_CAPACITY - 1) // COURT_CAPACITY


def count_responses(states: Sequence[str], member_count: int) -> EventCounts:
    """Tally answers. ``member_count`` is how many members were asked."""
    counts = EventCounts(
        yes=sum(1 for s in states if s == YES),
        no=sum(1 for s in states if s == NO),
        maybe=sum(1 for s in states if s == MAYBE),
    )
    # Guests can push the answered count past the membership; a negative
    # "still to hear from" would be nonsense on the screen.
    counts.unanswered = max(0, member_count - len(states))
    return counts


def _validate_type(type: str) -> None:
    if type not in EVENT_TYPES:
        raise DomainError("Ukendt begivenhedstype.")


def _validate_status(status: str) -> None:
    if status not in EVENT_STATUSES:
        raise DomainError("Ukendt status.")


def _validate_capacity(capacity: int) -> None:
    if capacity < 1 or capacity > MAX_CAPACITY:
        raise DomainError("Antallet af pladser ser forkert ud.")


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    return value.strip() or None


# --------------------------------------------------------------------------
# Database-backed entry points
# --------------------------------------------------------------------------


def get_event(db: DbSession, event_id: str) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise NotFoundError("Begivenheden findes ikke.")
    return event


def list_events(
    db: DbSession,
    *,
    scope: str = "upcoming",
    season_id: str | None = None,
    type: str | None = None,
    now: datetime | None = None,
) -> list[Event]:
    """Events in date order.

    ``upcoming`` counts today as upcoming -- an event is not history until the
    day is over -- and reads forwards. ``past`` reads backwards, newest first,
    which is the order anything looking back wants.
    """
    stmt = select(Event)
    if season_id:
        stmt = stmt.where(Event.season_id == season_id)
    if type:
        _validate_type(type)
        stmt = stmt.where(Event.type == type)

    cutoff = today(now)
    if scope == "upcoming":
        stmt = stmt.where(Event.held_on >= cutoff).order_by(
            Event.held_on, Event.start_time, Event.id
        )
    elif scope == "past":
        stmt = stmt.where(Event.held_on < cutoff).order_by(
            Event.held_on.desc(), Event.start_time.desc(), Event.id
        )
    elif scope == "all":
        stmt = stmt.order_by(Event.held_on, Event.start_time, Event.id)
    else:
        raise DomainError("Ukendt udsnit.")
    return list(db.execute(stmt).scalars().all())


def _member_count(db: DbSession) -> int:
    return len(
        db.execute(select(Player.id).where(Player.is_guest.is_(False))).scalars().all()
    )


def _responses_for(db: DbSession, event_ids: Sequence[str]) -> dict[str, list[EventResponse]]:
    if not event_ids:
        return {}
    rows = (
        db.execute(select(EventResponse).where(EventResponse.event_id.in_(list(event_ids))))
        .scalars()
        .all()
    )
    grouped: dict[str, list[EventResponse]] = {}
    for row in rows:
        grouped.setdefault(row.event_id, []).append(row)
    return grouped


def _selections_for(db: DbSession, event_ids: Sequence[str]) -> dict[str, list[EventSelection]]:
    if not event_ids:
        return {}
    rows = (
        db.execute(select(EventSelection).where(EventSelection.event_id.in_(list(event_ids))))
        .scalars()
        .all()
    )
    grouped: dict[str, list[EventSelection]] = {}
    for row in rows:
        grouped.setdefault(row.event_id, []).append(row)
    return grouped


def build_views(
    db: DbSession, events: Sequence[Event], *, viewer_id: str | None = None
) -> list[EventView]:
    """Event rows with their tallies, in one pass over the responses."""
    seasons = {s.id: s.name for s in season_service.list_seasons(db)}
    ids = [e.id for e in events]
    responses = _responses_for(db, ids)
    selections = _selections_for(db, ids)
    members = _member_count(db)

    views: list[EventView] = []
    for event in events:
        rows = responses.get(event.id, [])
        mine = next((r.state for r in rows if r.player_id == viewer_id), None) if viewer_id else None
        views.append(
            EventView(
                id=event.id,
                season_id=event.season_id,
                season_name=seasons.get(event.season_id, ""),
                type=event.type,
                held_on=event.held_on,
                start_time=event.start_time,
                venue=event.venue,
                opponent=event.opponent,
                capacity=event.capacity,
                status=event.status,
                note=event.note,
                session_id=event.session_id,
                counts=count_responses([r.state for r in rows], members),
                selected_count=len(selections.get(event.id, [])),
                my_state=mine,
            )
        )
    return views


def get_detail(db: DbSession, event_id: str, *, viewer_id: str | None = None) -> EventDetail:
    event = get_event(db, event_id)
    view = build_views(db, [event], viewer_id=viewer_id)[0]
    players = player_index(db)

    def info(player_id: str) -> PlayerInfo | None:
        return players.get(player_id)

    rows = (
        db.execute(select(EventResponse).where(EventResponse.event_id == event_id))
        .scalars()
        .all()
    )
    responses = [
        ResponseView(
            player=player,
            state=row.state,
            added_by=row.added_by,
            updated_at=row.updated_at,
        )
        for row in rows
        if (player := info(row.player_id)) is not None
    ]
    responses.sort(key=lambda r: r.player.name)

    answered = {r.player.id for r in responses}
    unanswered = sorted(
        (p for p in players.values() if not p.is_guest and p.id not in answered),
        key=lambda p: p.name,
    )

    picked = (
        db.execute(select(EventSelection).where(EventSelection.event_id == event_id))
        .scalars()
        .all()
    )
    selected = sorted(
        (player for row in picked if (player := info(row.player_id)) is not None),
        key=lambda p: p.name,
    )

    planned = (
        db.execute(
            select(EventMatchup)
            .where(EventMatchup.event_id == event_id)
            .order_by(EventMatchup.round, EventMatchup.court)
        )
        .scalars()
        .all()
    )
    matchups = [
        MatchupView(
            round=row.round,
            court=row.court,
            team_a=[p for pid in row.player_ids[:2] if (p := info(pid)) is not None],
            team_b=[p for pid in row.player_ids[2:] if (p := info(pid)) is not None],
        )
        for row in planned
    ]

    return EventDetail(
        event=view,
        responses=responses,
        unanswered=unanswered,
        selected=selected,
        matchups=matchups,
    )


def create_event(
    db: DbSession,
    *,
    type: str,
    held_on: date,
    start_time: time,
    venue: str,
    opponent: str | None = None,
    capacity: int | None = None,
    note: str | None = None,
    created_by: str | None = None,
) -> Event:
    _validate_type(type)
    clean_venue = venue.strip()
    if not clean_venue:
        raise DomainError("Begivenheden skal have et sted.")
    size = capacity if capacity is not None else default_capacity(type)
    _validate_capacity(size)
    # Same rule as a session: the date has to land inside a season, and a date
    # that does not is refused rather than stored against nothing.
    season = season_service.resolve_season_for_session(db, held_on)

    event = Event(
        id=new_id(ID_PREFIX),
        season_id=season.id,
        type=type,
        held_on=held_on,
        start_time=start_time,
        venue=clean_venue,
        # A training has no opponent even if one is sent; storing one would
        # put a ghost in the header of every Sunday.
        opponent=_clean_text(opponent) if type == MATCH else None,
        capacity=size,
        status=OPEN,
        note=_clean_text(note),
        created_by=created_by,
    )
    db.add(event)
    db.commit()
    return event


def update_event(
    db: DbSession,
    event_id: str,
    *,
    held_on: date | None = None,
    start_time: time | None = None,
    venue: str | None = None,
    opponent: str | None = None,
    capacity: int | None = None,
    status: str | None = None,
    note: str | None = None,
) -> Event:
    """Edit an event. An omitted field is left alone; an empty note clears it.

    Everything that can be refused is refused before anything is written, so a
    rejected edit never half-applies.
    """
    event = get_event(db, event_id)

    if status is not None:
        _validate_status(status)
    if capacity is not None:
        _validate_capacity(capacity)
    clean_venue = venue.strip() if venue is not None else None
    if venue is not None and not clean_venue:
        raise DomainError("Begivenheden skal have et sted.")
    season = (
        season_service.resolve_season_for_session(db, held_on)
        if held_on is not None and held_on != event.held_on
        else None
    )

    if held_on is not None and season is not None:
        event.held_on = held_on
        event.season_id = season.id
    if start_time is not None:
        event.start_time = start_time
    if clean_venue is not None:
        event.venue = clean_venue
    if opponent is not None and event.type == MATCH:
        event.opponent = _clean_text(opponent)
    if capacity is not None:
        event.capacity = capacity
    if status is not None:
        event.status = status
    if note is not None:
        event.note = _clean_text(note)

    db.commit()
    return event


def delete_event(db: DbSession, event_id: str) -> None:
    """Remove an event and everything answered about it.

    A session created from a training survives: it holds real matches and real
    ratings, and deleting a calendar entry must never reach them.
    """
    event = get_event(db, event_id)
    db.delete(event)
    db.commit()


# --------------------------------------------------------------------------
# Answers
# --------------------------------------------------------------------------


def _writable(event: Event) -> None:
    if event.status == CANCELLED:
        raise DomainError("Begivenheden er aflyst.")


def _answerable(event: Event, *, by_admin: bool) -> None:
    """Whether an answer may still be written.

    ``locked`` means the squad has been picked. Letting a player quietly
    change their answer under a finished team sheet is the thing locking
    exists to stop, so the rule lives here rather than only in a disabled
    button -- a status the API does not enforce is a status that is not true.
    An admin still edits, which is how a late withdrawal gets recorded.
    """
    _writable(event)
    if event.status == LOCKED and not by_admin:
        raise DomainError("Holdet er sat, så svarene er låst. Sig det til en admin.")


def set_response(
    db: DbSession,
    event_id: str,
    player_id: str,
    state: str,
    *,
    added_by: str | None = None,
    by_admin: bool = False,
) -> EventResponse:
    """Record one answer, replacing any earlier one from the same player."""
    if state not in RESPONSE_STATES:
        raise DomainError("Ukendt svar.")
    event = get_event(db, event_id)
    _answerable(event, by_admin=by_admin)
    if db.get(Player, player_id) is None:
        raise NotFoundError("Spilleren findes ikke.")

    existing = db.execute(
        select(EventResponse).where(
            EventResponse.event_id == event_id, EventResponse.player_id == player_id
        )
    ).scalar_one_or_none()
    if existing is not None:
        existing.state = state
        existing.updated_at = utcnow()
        db.commit()
        return existing

    response = EventResponse(
        id=new_id("response"),
        event_id=event_id,
        player_id=player_id,
        state=state,
        added_by=added_by,
    )
    db.add(response)
    db.commit()
    return response


def clear_response(
    db: DbSession, event_id: str, player_id: str, *, by_admin: bool = False
) -> None:
    """Back to silence. This is also how a guest is taken off the list."""
    event = get_event(db, event_id)
    _answerable(event, by_admin=by_admin)
    existing = db.execute(
        select(EventResponse).where(
            EventResponse.event_id == event_id, EventResponse.player_id == player_id
        )
    ).scalar_one_or_none()
    if existing is None:
        return
    db.delete(existing)
    db.commit()


def available_ids(db: DbSession, event_id: str) -> list[str]:
    """Everyone who said yes. Not everyone who will play."""
    return list(
        db.execute(
            select(EventResponse.player_id).where(
                EventResponse.event_id == event_id, EventResponse.state == YES
            )
        )
        .scalars()
        .all()
    )


# --------------------------------------------------------------------------
# Squad and plan
# --------------------------------------------------------------------------


def set_selection(db: DbSession, event_id: str, player_ids: Sequence[str]) -> list[str]:
    """Replace the squad wholesale.

    An admin picks a squad as one decision, so it is written as one. Players
    who are not available can be picked -- somebody says yes in the group chat
    and never updates the app -- but nothing here infers availability from
    selection or the other way round.
    """
    event = get_event(db, event_id)
    _writable(event)

    unique = list(dict.fromkeys(player_ids))
    if unique:
        known = set(
            db.execute(select(Player.id).where(Player.id.in_(unique))).scalars().all()
        )
        missing = [pid for pid in unique if pid not in known]
        if missing:
            raise DomainError("En eller flere spillere findes ikke.")
    if len(unique) > MAX_CAPACITY:
        raise DomainError("Der er valgt for mange spillere.")

    for row in (
        db.execute(select(EventSelection).where(EventSelection.event_id == event_id))
        .scalars()
        .all()
    ):
        db.delete(row)
    # The old squad has to leave the table before the new one arrives: a flush
    # orders inserts ahead of deletes, and the ordinary edit -- swap one name,
    # keep the other five -- would land on UNIQUE(event_id, player_id).
    db.flush()
    for player_id in unique:
        db.add(EventSelection(id=new_id("selection"), event_id=event_id, player_id=player_id))
    db.commit()
    return unique


@dataclass(frozen=True)
class MatchupInput:
    round: int
    court: int
    team_a: tuple[str, str]
    team_b: tuple[str, str]


def validate_matchups(matchups: Sequence[MatchupInput]) -> None:
    """Pure. Four distinct players per court, one court per slot, nobody twice
    in the same round -- a person cannot be on two courts at once."""
    seen_slots: set[tuple[int, int]] = set()
    per_round: dict[int, set[str]] = {}
    for matchup in matchups:
        if matchup.round < 1 or matchup.round > MAX_ROUNDS:
            raise DomainError("Runden ser forkert ud.")
        if matchup.court < 1 or matchup.court > MAX_COURTS:
            raise DomainError("Banen ser forkert ud.")
        slot = (matchup.round, matchup.court)
        if slot in seen_slots:
            raise DomainError(f"Bane {matchup.court} er sat to gange i runde {matchup.round}.")
        seen_slots.add(slot)

        players = [*matchup.team_a, *matchup.team_b]
        if len(set(players)) != 4:
            raise DomainError("En kamp skal have fire forskellige spillere.")
        busy = per_round.setdefault(matchup.round, set())
        clash = busy.intersection(players)
        if clash:
            raise DomainError(f"En spiller er sat på to baner i runde {matchup.round}.")
        busy.update(players)


def set_matchups(db: DbSession, event_id: str, matchups: Sequence[MatchupInput]) -> None:
    """Replace the plan wholesale.

    These are planned line-ups and nothing more. They are never turned into
    ``Match`` rows here; score entry writes those, from the same screen every
    other result goes through. Nothing in this function can move a rating.
    """
    event = get_event(db, event_id)
    _writable(event)
    validate_matchups(matchups)

    ids = {pid for m in matchups for pid in (*m.team_a, *m.team_b)}
    if ids:
        known = set(db.execute(select(Player.id).where(Player.id.in_(list(ids)))).scalars().all())
        if ids - known:
            raise DomainError("En eller flere spillere findes ikke.")

    for row in (
        db.execute(select(EventMatchup).where(EventMatchup.event_id == event_id)).scalars().all()
    ):
        db.delete(row)
    # The old plan has to leave the table before the new one arrives, for the
    # same reason the squad does: a flush orders inserts ahead of deletes, and
    # replanning almost always reuses round 1 on court 1, which is exactly
    # what UNIQUE(event_id, round, court) forbids twice over.
    db.flush()
    for matchup in matchups:
        db.add(
            EventMatchup(
                id=new_id("matchup"),
                event_id=event_id,
                round=matchup.round,
                court=matchup.court,
                team_a_player1_id=matchup.team_a[0],
                team_a_player2_id=matchup.team_a[1],
                team_b_player1_id=matchup.team_b[0],
                team_b_player2_id=matchup.team_b[1],
            )
        )
    db.commit()


# --------------------------------------------------------------------------
# The handover: a planned training becomes an evening with results
# --------------------------------------------------------------------------


def create_session_for(db: DbSession, event_id: str, *, created_by: str | None = None):
    """Open the session a training's results go into, and link the two.

    Only a training gets one. A fixture is a league match against another
    club: there is no internal doubles result to enter and none of it belongs
    on the ladder.

    This creates an empty session -- the same one the "+" button would have
    made -- and nothing else. Who played is still decided by the matches that
    get typed in; the yes-list only pre-fills the picker.
    """
    event = get_event(db, event_id)
    if event.type != TRAINING:
        raise DomainError("Kun en træning kan blive til en session.")
    if event.status == CANCELLED:
        raise DomainError("Træningen er aflyst.")
    if event.session_id is not None:
        existing = db.get(PlaySession, event.session_id)
        if existing is not None:
            raise DomainError("Der er allerede oprettet en session for træningen.")

    play_session = session_service.create_session(
        db,
        played_on=event.held_on,
        type=TRAINING,
        note=event.note,
        created_by=created_by,
    )
    event.session_id = play_session.id
    db.commit()
    return play_session


__all__ = [
    "CANCELLED",
    "COURT_CAPACITY",
    "LOCKED",
    "MATCH",
    "MAYBE",
    "NO",
    "OPEN",
    "TRAINING",
    "YES",
    "EventCounts",
    "EventDetail",
    "EventView",
    "MatchupInput",
    "MatchupView",
    "ResponseView",
    "available_ids",
    "build_views",
    "clear_response",
    "count_responses",
    "courts_for",
    "create_event",
    "create_session_for",
    "default_capacity",
    "delete_event",
    "get_detail",
    "get_event",
    "list_events",
    "set_matchups",
    "set_response",
    "set_selection",
    "today",
    "update_event",
    "validate_matchups",
]
