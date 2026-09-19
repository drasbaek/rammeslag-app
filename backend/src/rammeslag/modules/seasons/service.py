"""Season lookups. No FastAPI imports."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from rammeslag.modules.matches.service import NotFoundError
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
