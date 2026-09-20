"""Events: the things people answer before they happen.

Four tables. ``events`` is the calendar entry -- a league fixture or a Sunday
training -- and the other three hang off it: who answered, who was picked,
and what the planned line-ups are.

Nothing here touches ``matches`` or ``match_sets``. No rating can move as a
result of this migration.

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-20
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "events",
        sa.Column("id", sa.String(length=64), primary_key=True),
        # NOT NULL, same rule as sessions: a date outside every season is a
        # refusal, not a nullable column with a convention attached.
        sa.Column("season_id", sa.String(length=64), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("held_on", sa.Date(), nullable=False),
        # Copenhagen wall clock, stored naive. "18:00" is what the old sheet
        # said and what a player reads.
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("venue", sa.String(length=120), nullable=False),
        # Fixtures only. Free text: these are other clubs' team names.
        sa.Column("opponent", sa.String(length=120), nullable=True),
        # Player slots: a fixture's squad size, or a training's courts x 4.
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column("note", sa.Text(), nullable=True),
        # The one nullable FK in the schema, and deliberate. A training has a
        # session only after it has been played, so this is optional state
        # over time rather than a discriminator a type column could carry.
        sa.Column("session_id", sa.String(length=64), nullable=True),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["season_id"], ["seasons.id"], name="fk_events_season", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["session_id"], ["sessions.id"], name="fk_events_session", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["players.id"], name="fk_events_created_by", ondelete="SET NULL"
        ),
    )
    op.create_index("ix_events_season_id", "events", ["season_id"])
    op.create_index("ix_events_held_on", "events", ["held_on"])

    op.create_table(
        "event_responses",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("event_id", sa.String(length=64), nullable=False),
        sa.Column("player_id", sa.String(length=64), nullable=False),
        # yes | no | maybe. No row at all means "has not answered", which is
        # a different thing from "ved ikke" and stays a different thing.
        sa.Column("state", sa.String(length=10), nullable=False),
        sa.Column("added_by", sa.String(length=64), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["event_id"], ["events.id"], name="fk_event_responses_event", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["player_id"], ["players.id"], name="fk_event_responses_player", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["added_by"], ["players.id"], name="fk_event_responses_added_by", ondelete="SET NULL"
        ),
        sa.UniqueConstraint("event_id", "player_id", name="uq_event_responses_event_player"),
    )
    op.create_index("ix_event_responses_event_id", "event_responses", ["event_id"])
    op.create_index("ix_event_responses_player_id", "event_responses", ["player_id"])

    op.create_table(
        "event_selections",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("event_id", sa.String(length=64), nullable=False),
        sa.Column("player_id", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["event_id"], ["events.id"], name="fk_event_selections_event", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["player_id"], ["players.id"], name="fk_event_selections_player", ondelete="RESTRICT"
        ),
        sa.UniqueConstraint("event_id", "player_id", name="uq_event_selections_event_player"),
    )
    op.create_index("ix_event_selections_event_id", "event_selections", ["event_id"])
    op.create_index("ix_event_selections_player_id", "event_selections", ["player_id"])

    op.create_table(
        "event_matchups",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("event_id", sa.String(length=64), nullable=False),
        sa.Column("round", sa.Integer(), nullable=False),
        sa.Column("court", sa.Integer(), nullable=False),
        sa.Column("team_a_player1_id", sa.String(length=64), nullable=False),
        sa.Column("team_a_player2_id", sa.String(length=64), nullable=False),
        sa.Column("team_b_player1_id", sa.String(length=64), nullable=False),
        sa.Column("team_b_player2_id", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(
            ["event_id"], ["events.id"], name="fk_event_matchups_event", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["team_a_player1_id"], ["players.id"], name="fk_event_matchups_a1", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["team_a_player2_id"], ["players.id"], name="fk_event_matchups_a2", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["team_b_player1_id"], ["players.id"], name="fk_event_matchups_b1", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["team_b_player2_id"], ["players.id"], name="fk_event_matchups_b2", ondelete="RESTRICT"
        ),
        sa.UniqueConstraint("event_id", "round", "court", name="uq_event_matchups_slot"),
    )
    op.create_index("ix_event_matchups_event_id", "event_matchups", ["event_id"])


def downgrade() -> None:
    op.drop_table("event_matchups")
    op.drop_table("event_selections")
    op.drop_table("event_responses")
    op.drop_table("events")
