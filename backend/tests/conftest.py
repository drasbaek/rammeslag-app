"""Shared test fixtures.

There is no local Postgres on a laptop, so the DB-backed tests run against an
in-memory SQLite database by default and against the real thing when
DATABASE_URL is set. Anything that genuinely needs Postgres (the migrations)
asks for the ``postgres_engine`` fixture and skips cleanly when the variable is
absent.

Most of the interesting logic -- ladder ranking, season gains, recaps, pair
stats -- is pure and tested without any database at all.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import UTC, date, datetime, time, timedelta

import pytest
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session as DbSession
from sqlalchemy.pool import StaticPool

# Deterministic settings before anything reads them.
os.environ.setdefault("SESSION_SECRET", "test-secret")
os.environ.setdefault("COOKIE_SECURE", "false")
os.environ.setdefault("ENVIRONMENT", "development")

from rammeslag import db as db_module
from rammeslag.config import reset_settings_cache
from rammeslag.db import Base
from rammeslag.deps import reset_serializer_cache
from rammeslag.modules.events.models import (  # noqa: F401
    Event,
    EventMatchup,
    EventResponse,
    EventSelection,
)
from rammeslag.modules.matches.models import Match, MatchSet
from rammeslag.modules.players.models import Player
from rammeslag.modules.rating.constants import SEED_RATING
from rammeslag.modules.seasons.models import Season
from rammeslag.modules.sessions.models import Session as PlaySession

DATABASE_URL = os.environ.get("DATABASE_URL", "")

EFTERAAR = ("Efterår 2025", date(2025, 8, 25), date(2025, 11, 16))
FORAAR = ("Forår 2026", date(2026, 1, 12), date(2026, 3, 16))


def _make_engine() -> Engine:
    if DATABASE_URL:
        return create_engine(db_module.normalize_database_url(DATABASE_URL), future=True)
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


@pytest.fixture
def engine() -> Iterator[Engine]:
    reset_settings_cache()
    reset_serializer_cache()
    eng = _make_engine()
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    db_module.configure_engine(eng)
    try:
        yield eng
    finally:
        Base.metadata.drop_all(eng)
        db_module.reset_engine()
        eng.dispose()


@pytest.fixture
def db(engine: Engine) -> Iterator[DbSession]:
    session = db_module.get_sessionmaker()()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def postgres_engine() -> Iterator[Engine]:
    """A real Postgres engine, or a clean skip. Used by migration tests."""
    if not DATABASE_URL or "postgres" not in DATABASE_URL:
        pytest.skip("DATABASE_URL is not set to a Postgres database")
    eng = create_engine(db_module.normalize_database_url(DATABASE_URL), future=True)
    try:
        yield eng
    finally:
        eng.dispose()


@pytest.fixture
def client(engine: Engine):
    from fastapi.testclient import TestClient

    from rammeslag.main import create_app

    with TestClient(create_app()) as test_client:
        yield test_client


# --------------------------------------------------------------------------
# Factories
# --------------------------------------------------------------------------


def make_player(
    db: DbSession,
    player_id: str,
    name: str | None = None,
    *,
    pin: str | None = None,
    is_admin: bool = False,
    is_guest: bool = False,
    entry_rating: float = SEED_RATING,
) -> Player:
    """``entry_rating`` is NOT NULL in the schema, so it is always supplied.

    Tests that care about it pass their own; the rest take the seed, which is
    what the spec calls the suggested default.
    """
    from rammeslag.modules.players.service import hash_pin

    player = Player(
        id=player_id,
        name=name or player_id.title(),
        is_admin=is_admin,
        is_guest=is_guest,
        entry_rating=entry_rating,
        pin_hash=hash_pin(pin) if pin else None,
        created_at=datetime(2025, 8, 1, tzinfo=UTC),
    )
    db.add(player)
    db.commit()
    return player


def make_season(db: DbSession, spec: tuple[str, date, date], season_id: str) -> Season:
    name, starts_on, ends_on = spec
    season = Season(id=season_id, name=name, starts_on=starts_on, ends_on=ends_on)
    db.add(season)
    db.commit()
    return season


def make_session(
    db: DbSession,
    session_id: str,
    season_id: str,
    played_on: date,
    *,
    type: str = "training",
    status: str = "open",
    note: str | None = None,
) -> PlaySession:
    play_session = PlaySession(
        id=session_id,
        season_id=season_id,
        played_on=played_on,
        type=type,
        status=status,
        note=note,
        created_at=datetime(2025, 8, 1, tzinfo=UTC),
    )
    db.add(play_session)
    db.commit()
    return play_session


def make_event(
    db: DbSession,
    event_id: str,
    season_id: str,
    held_on: date,
    *,
    type: str = "training",
    start_time: time = time(18, 0),
    venue: str = "Pakhus77",
    opponent: str | None = None,
    capacity: int | None = None,
    status: str = "open",
    note: str | None = None,
) -> Event:
    event = Event(
        id=event_id,
        season_id=season_id,
        type=type,
        held_on=held_on,
        start_time=start_time,
        venue=venue,
        opponent=opponent,
        capacity=capacity if capacity is not None else (6 if type == "match" else 12),
        status=status,
        note=note,
        created_at=datetime(2025, 8, 1, tzinfo=UTC),
    )
    db.add(event)
    db.commit()
    return event


def make_match(
    db: DbSession,
    match_id: str,
    session_id: str,
    played_at: datetime,
    team_a: tuple[str, str],
    team_b: tuple[str, str],
    sets: list[tuple[int, int]],
    *,
    source: str = "internal",
) -> Match:
    match = Match(
        id=match_id,
        session_id=session_id,
        played_at=played_at,
        source=source,
        team_a_player1_id=team_a[0],
        team_a_player2_id=team_a[1],
        team_b_player1_id=team_b[0],
        team_b_player2_id=team_b[1],
        created_at=played_at,
    )
    for number, (games_a, games_b) in enumerate(sets, start=1):
        match.sets.append(
            MatchSet(
                id=f"{match_id}-s{number}",
                set_number=number,
                games_a=games_a,
                games_b=games_b,
            )
        )
    db.add(match)
    db.commit()
    return match


def row(
    match_id: str,
    session_id: str,
    minutes: int,
    team_a: tuple[str, str],
    team_b: tuple[str, str],
    sets: list[tuple[int, int]],
    *,
    source: str = "internal",
    base: datetime = datetime(2025, 9, 1, 18, 0, tzinfo=UTC),
):
    """A plain MatchRow for the pure tests. No database involved."""
    from rammeslag.modules.matches.service import MatchRow

    when = base + timedelta(minutes=minutes)
    return MatchRow(
        id=match_id,
        session_id=session_id,
        played_at=when,
        created_at=when,
        source=source,
        team_a=team_a,
        team_b=team_b,
        sets=tuple(sets),
    )


def login(client, player_id: str, pin: str):
    return client.post("/api/auth/login", json={"player_id": player_id, "pin": pin})
