"""The migrations must produce exactly the schema the ORM models describe.

These run only when DATABASE_URL points at Postgres, and skip cleanly
otherwise -- SQLite cannot tell us anything useful about a Postgres migration.
Each test builds the whole schema inside a throwaway Postgres schema and drops
it again, so it never touches the application's tables.
"""

from __future__ import annotations

from collections.abc import Iterator
from uuid import uuid4

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import Engine, inspect, text

from rammeslag.db import Base

# Every table the app owns. `alembic_version` is Alembic's own bookkeeping.
EXPECTED_TABLES = {"players", "seasons", "sessions", "matches", "match_sets"}


def _alembic_config(engine: Engine, schema: str) -> Config:
    """Alembic pointed at one throwaway Postgres schema."""
    config = Config("alembic.ini")
    url = engine.url.set(
        query={**dict(engine.url.query), "options": f"-csearch_path={schema}"}
    )
    # alembic.ini is a configparser file, so a literal % in the URL (Neon
    # passwords are percent-encoded) has to be escaped before it is set.
    rendered = url.render_as_string(hide_password=False).replace("%", "%%")
    config.set_main_option("sqlalchemy.url", rendered)
    return config


@pytest.fixture
def migrated_schema(postgres_engine: Engine) -> Iterator[tuple[Engine, str]]:
    """``alembic upgrade head`` inside a scratch schema, dropped afterwards."""
    schema = f"migtest_{uuid4().hex[:8]}"
    with postgres_engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    try:
        command.upgrade(_alembic_config(postgres_engine, schema), "head")
        yield postgres_engine, schema
    finally:
        with postgres_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))


def test_upgrade_head_creates_every_table(migrated_schema) -> None:
    engine, schema = migrated_schema
    tables = set(inspect(engine).get_table_names(schema=schema))
    assert EXPECTED_TABLES <= tables
    assert "alembic_version" in tables


def test_the_migrated_schema_matches_the_models(migrated_schema) -> None:
    """If this fails, a model changed without a migration (or the reverse)."""
    engine, schema = migrated_schema
    with engine.connect() as connection:
        connection.execute(text(f'SET search_path TO "{schema}"'))
        context = MigrationContext.configure(
            connection,
            opts={"compare_type": True, "include_schemas": False},
        )
        diff = [
            entry
            for entry in compare_metadata(context, Base.metadata)
            # Alembic's own version table is not in Base.metadata.
            if "alembic_version" not in repr(entry)
        ]
    assert diff == [], f"schema drifted from the models: {diff}"


def test_entry_rating_is_required_and_has_no_server_default(migrated_schema) -> None:
    """docs/RATING.md: an admin sets it deliberately; a silent 1000 is a guess."""
    engine, schema = migrated_schema
    columns = {c["name"]: c for c in inspect(engine).get_columns("players", schema=schema)}
    assert "entry_rating" in columns
    assert columns["entry_rating"]["nullable"] is False
    assert columns["entry_rating"].get("default") is None


def test_session_id_on_matches_is_not_nullable(migrated_schema) -> None:
    """AGENTS.md hard rule 6: no nullable foreign key where a type column would do."""
    engine, schema = migrated_schema
    columns = {c["name"]: c for c in inspect(engine).get_columns("matches", schema=schema)}
    assert columns["session_id"]["nullable"] is False
    seasons = {c["name"]: c for c in inspect(engine).get_columns("sessions", schema=schema)}
    assert seasons["season_id"]["nullable"] is False


def test_downgrade_removes_everything_it_created(migrated_schema) -> None:
    engine, schema = migrated_schema
    command.downgrade(_alembic_config(engine, schema), "base")
    tables = set(inspect(engine).get_table_names(schema=schema))
    assert tables & EXPECTED_TABLES == set()
