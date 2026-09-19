"""Match and MatchSet ORM models.

Game totals are never stored: they are the sum over ``match_sets``. Only
``source = 'internal'`` matches reach the rating engine.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from rammeslag.db import Base, UtcDateTime, new_id, utcnow

ID_PREFIX = "match"

MATCH_SOURCES = ("internal", "rankedin")


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: new_id(ID_PREFIX)
    )
    # NOT NULL on purpose. Every match belongs to a session, even a one-off.
    session_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    played_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="internal")

    team_a_player1_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("players.id", ondelete="RESTRICT"), nullable=False
    )
    team_a_player2_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("players.id", ondelete="RESTRICT"), nullable=False
    )
    team_b_player1_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("players.id", ondelete="RESTRICT"), nullable=False
    )
    team_b_player2_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("players.id", ondelete="RESTRICT"), nullable=False
    )

    created_by: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False, default=utcnow)

    sets: Mapped[list[MatchSet]] = relationship(
        back_populates="match",
        cascade="all, delete-orphan",
        order_by="MatchSet.set_number",
        lazy="selectin",
    )

    @property
    def player_ids(self) -> tuple[str, str, str, str]:
        return (
            self.team_a_player1_id,
            self.team_a_player2_id,
            self.team_b_player1_id,
            self.team_b_player2_id,
        )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Match {self.id} {self.played_at.isoformat()}>"


class MatchSet(Base):
    __tablename__ = "match_sets"
    __table_args__ = (UniqueConstraint("match_id", "set_number", name="uq_match_sets_match_number"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("set"))
    match_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("matches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    set_number: Mapped[int] = mapped_column(Integer, nullable=False)
    games_a: Mapped[int] = mapped_column(Integer, nullable=False)
    games_b: Mapped[int] = mapped_column(Integer, nullable=False)

    match: Mapped[Match] = relationship(back_populates="sets")

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<MatchSet {self.match_id}#{self.set_number} {self.games_a}-{self.games_b}>"
