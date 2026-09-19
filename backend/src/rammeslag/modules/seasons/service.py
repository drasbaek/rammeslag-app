"""Season lookups. No FastAPI imports."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from rammeslag.modules.matches.service import DomainError, NotFoundError
from rammeslag.modules.seasons.models import Season


def list_seasons(db: DbSession) -> list[Season]:
    return list(db.execute(select(Season).order_by(Season.starts_on)).scalars().all())


def get_season(db: DbSession, season_id: str) -> Season:
    season = db.get(Season, season_id)
    if season is None:
        raise NotFoundError("Sæsonen findes ikke.")
    return season


def season_for_date(seasons: Sequence[Season], day: date) -> Season | None:
    """The season whose inclusive date range contains ``day``, if any."""
    for season in seasons:
        if season.contains(day):
            return season
    return None


def pick_current_season(seasons: Sequence[Season], today: date) -> Season | None:
    """The season we are in, or -- between seasons -- the most recent one.

    "Active" on the ladder means "has played in the current season", so this
    needs an answer even in the gap between Efterår and Forår.
    """
    if not seasons:
        return None
    ordered = sorted(seasons, key=lambda s: s.starts_on)
    live = season_for_date(ordered, today)
    if live is not None:
        return live
    started = [s for s in ordered if s.starts_on <= today]
    if started:
        return started[-1]
    # Everything is still in the future: the first one is the upcoming season.
    return ordered[0]


def resolve_season_for_session(db: DbSession, day: date) -> Season:
    """The season a new session on ``day`` belongs to.

    ``sessions.season_id`` is NOT NULL, so a date outside every season is a
    refusal rather than a nullable column with a convention attached.
    """
    season = season_for_date(list_seasons(db), day)
    if season is None:
        raise NotFoundError("Der findes ingen sæson, der dækker den dato.")
    return season


def _validate_range(starts_on: date, ends_on: date) -> None:
    if ends_on < starts_on:
        raise DomainError("Sæsonen slutter før den starter.")


def _validate_no_overlap(
    db: DbSession, starts_on: date, ends_on: date, *, exclude_id: str | None = None
) -> None:
    """Seasons may not overlap.

    ``resolve_season_for_session`` picks the one season covering a date, so two
    overlapping seasons would make that answer arbitrary.
    """
    for other in list_seasons(db):
        if other.id == exclude_id:
            continue
        if starts_on <= other.ends_on and other.starts_on <= ends_on:
            raise DomainError(
                f"Sæsonen overlapper med {other.name} "
                f"({other.starts_on:%d.%m.%Y}-{other.ends_on:%d.%m.%Y})."
            )


def _validate_covers_own_sessions(db: DbSession, season: Season, starts_on: date, ends_on: date):
    """Narrowing a season must not strand the sessions already in it.

    ``sessions.season_id`` is NOT NULL, so a session whose date fell outside its
    own season would be unreachable by every date-based query while still
    counting toward that season's standings.
    """
    from rammeslag.modules.sessions.models import Session as PadelSession

    stranded = db.scalars(
        select(PadelSession)
        .where(PadelSession.season_id == season.id)
        .where((PadelSession.played_on < starts_on) | (PadelSession.played_on > ends_on))
        .order_by(PadelSession.played_on)
    ).all()
    if stranded:
        days = ", ".join(f"{s.played_on:%d.%m.%Y}" for s in stranded[:3])
        more = f" og {len(stranded) - 3} mere" if len(stranded) > 3 else ""
        raise DomainError(
            f"{len(stranded)} session(er) ligger uden for de nye datoer: {days}{more}."
        )


def create_season(db: DbSession, *, name: str, starts_on: date, ends_on: date) -> Season:
    _validate_range(starts_on, ends_on)
    _validate_no_overlap(db, starts_on, ends_on)
    if any(s.name == name for s in list_seasons(db)):
        raise DomainError(f"Der findes allerede en sæson, der hedder {name}.")
    season = Season(name=name, starts_on=starts_on, ends_on=ends_on)
    db.add(season)
    db.flush()
    return season


def update_season(
    db: DbSession,
    season_id: str,
    *,
    name: str | None = None,
    starts_on: date | None = None,
    ends_on: date | None = None,
) -> Season:
    season = get_season(db, season_id)
    new_start = starts_on if starts_on is not None else season.starts_on
    new_end = ends_on if ends_on is not None else season.ends_on

    _validate_range(new_start, new_end)
    _validate_no_overlap(db, new_start, new_end, exclude_id=season.id)
    if (new_start, new_end) != (season.starts_on, season.ends_on):
        _validate_covers_own_sessions(db, season, new_start, new_end)
    if name is not None and name != season.name:
        if any(s.name == name and s.id != season.id for s in list_seasons(db)):
            raise DomainError(f"Der findes allerede en sæson, der hedder {name}.")
        season.name = name

    season.starts_on = new_start
    season.ends_on = new_end
    db.flush()
    return season
