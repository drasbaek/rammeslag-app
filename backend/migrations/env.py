"""Alembic environment.

The URL comes from DATABASE_URL (Neon in production, whatever a human points
it at locally). It is never written into alembic.ini.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from rammeslag.config import get_settings
from rammeslag.db import Base, normalize_database_url

# Importing every module's models is what populates Base.metadata.
from rammeslag.modules.events import models as events_models  # noqa: F401
from rammeslag.modules.matches import models as matches_models  # noqa: F401
from rammeslag.modules.players import models as players_models  # noqa: F401
from rammeslag.modules.seasons import models as seasons_models  # noqa: F401
from rammeslag.modules.sessions import models as sessions_models  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _database_url() -> str:
    url = config.get_main_option("sqlalchemy.url") or get_settings().database_url
    if not url:
        raise RuntimeError("DATABASE_URL is not set; alembic has nothing to migrate.")
    return normalize_database_url(url)


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = _database_url()
    connectable = engine_from_config(section, prefix="sqlalchemy.", poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata, compare_type=True
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
