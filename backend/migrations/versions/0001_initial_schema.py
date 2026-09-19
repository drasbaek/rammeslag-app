"""Initial schema: players, seasons, sessions, matches, match_sets.

Revision ID: 0001
Revises:
Create Date: 2026-09-19
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "players",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False, unique=True),
        sa.Column("is_guest", sa.Boolean(), nullable=False, server_default=sa.false()),
        # No server default on purpose. An admin judges where a newcomer enters
        # an established field; a silent 1000 would be a guess dressed up as data.
        sa.Column("entry_rating", sa.Float(), nullable=False),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("pin_hash", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "seasons",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False, unique=True),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
    )

    op.create_table(
        "sessions",
        sa.Column("id", sa.String(length=64), primary_key=True),
        # NOT NULL on purpose: variation lives in `type`, not in a nullable FK.
        sa.Column("season_id", sa.String(length=64), nullable=False),
        sa.Column("played_on", sa.Date(), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False, server_default="training"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["season_id"], ["seasons.id"], name="fk_sessions_season", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["players.id"], name="fk_sessions_created_by", ondelete="SET NULL"
        ),
    )
    op.create_index("ix_sessions_season_id", "sessions", ["season_id"])
    op.create_index("ix_sessions_played_on", "sessions", ["played_on"])

    op.create_table(
        "matches",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("session_id", sa.String(length=64), nullable=False),
        sa.Column("played_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False, server_default="internal"),
        sa.Column("team_a_player1_id", sa.String(length=64), nullable=False),
        sa.Column("team_a_player2_id", sa.String(length=64), nullable=False),
        sa.Column("team_b_player1_id", sa.String(length=64), nullable=False),
        sa.Column("team_b_player2_id", sa.String(length=64), nullable=False),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["session_id"], ["sessions.id"], name="fk_matches_session", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["team_a_player1_id"], ["players.id"], name="fk_matches_a1", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["team_a_player2_id"], ["players.id"], name="fk_matches_a2", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["team_b_player1_id"], ["players.id"], name="fk_matches_b1", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["team_b_player2_id"], ["players.id"], name="fk_matches_b2", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["players.id"], name="fk_matches_created_by", ondelete="SET NULL"
        ),
    )
    op.create_index("ix_matches_session_id", "matches", ["session_id"])
    op.create_index("ix_matches_played_at", "matches", ["played_at"])

    op.create_table(
        "match_sets",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("match_id", sa.String(length=64), nullable=False),
        sa.Column("set_number", sa.Integer(), nullable=False),
        # Game totals are derived by summing these rows, never stored.
        sa.Column("games_a", sa.Integer(), nullable=False),
        sa.Column("games_b", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["match_id"], ["matches.id"], name="fk_match_sets_match", ondelete="CASCADE"
        ),
        sa.UniqueConstraint("match_id", "set_number", name="uq_match_sets_match_number"),
    )
    op.create_index("ix_match_sets_match_id", "match_sets", ["match_id"])


def downgrade() -> None:
    op.drop_table("match_sets")
    op.drop_table("matches")
    op.drop_table("sessions")
    op.drop_table("seasons")
    op.drop_table("players")
