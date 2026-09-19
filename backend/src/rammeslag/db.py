"""Engine, session factory and the declarative base.

The engine is created lazily so that importing the application -- or any
module that only needs the ORM classes -- never requires DATABASE_URL.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import DateTime, Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.types import TypeDecorator

from rammeslag.config import get_settings


class Base(DeclarativeBase):
    """Declarative base for every ORM model in the app."""


class UtcDateTime(TypeDecorator):
    """A timestamp that is always timezone-aware UTC on the Python side.

    Postgres stores it as ``timestamptz``. SQLite (used by the test suite when
    no Postgres is available) has no timezone support, so we normalise on the
    way in and re-attach UTC on the way out. Without this, replay ordering and
    season-window comparisons would blow up on naive/aware mixing.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def process_result_value(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


def utcnow() -> datetime:
    return datetime.now(UTC)


def new_id(prefix: str) -> str:
    """Readable, sortable-enough surrogate key, e.g. ``match-8f3831c6``.

    The historical export already uses this shape, so imported rows keep their
    original identifiers and the format stays uniform.
    """
    return f"{prefix}-{uuid4().hex[:8]}"


def normalize_database_url(url: str) -> str:
    """Make hosted Postgres URLs usable by SQLAlchemy 2.0 + psycopg 3."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


_engine: Engine | None = None
_sessionmaker: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        settings = get_settings()
        if not settings.database_url:
            raise RuntimeError(
                "DATABASE_URL is not set. The API cannot serve data without a database."
            )
        _engine = create_engine(
            normalize_database_url(settings.database_url),
            pool_pre_ping=True,
            # Serverless functions get a new process per cold start; a small
            # pool keeps Neon's connection limit comfortable.
            pool_size=3,
            max_overflow=2,
            future=True,
        )
    return _engine


def get_sessionmaker() -> sessionmaker[Session]:
    global _sessionmaker
    if _sessionmaker is None:
        _sessionmaker = sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)
    return _sessionmaker


def configure_engine(engine: Engine) -> None:
    """Install an explicit engine. Used by tests and by scripts/import_history.py."""
    global _engine, _sessionmaker
    _engine = engine
    _sessionmaker = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def reset_engine() -> None:
    global _engine, _sessionmaker
    _engine = None
    _sessionmaker = None


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional scope. Used outside the request lifecycle."""
    session = get_sessionmaker()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
