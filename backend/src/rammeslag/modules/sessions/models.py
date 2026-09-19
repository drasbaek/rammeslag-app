"""Session ORM model.

A session is an evening: one date, one season, zero or more matches. A one-off
game is a ``casual`` session; a bøde night with no padel is a ``social``
session with no matches at all. Variation lives in ``type``, never in a
nullable foreign key.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from rammeslag.db import Base, UtcDateTime, new_id, utcnow

ID_PREFIX = "session"

SESSION_TYPES = ("training", "casual", "social", "tournament")
SESSION_STATUSES = ("open", "closed")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: new_id(ID_PREFIX)
    )
    season_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("seasons.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    played_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False, default="training")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Null for rows imported from the old app, which recorded no author.
    created_by: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False, default=utcnow)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Session {self.id} {self.played_on}>"
