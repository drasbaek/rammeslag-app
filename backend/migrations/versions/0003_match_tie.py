"""Match-tie: a third set played to points instead of games.

One column. Every existing row is a real set, so the default is false and
nothing already recorded changes meaning.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "match_sets",
        sa.Column("tiebreak", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("match_sets", "tiebreak")
