"""Player ORM model."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Float, String
from sqlalchemy.orm import Mapped, mapped_column

from rammeslag.db import Base, UtcDateTime, new_id, utcnow

ID_PREFIX = "player"


class Player(Base):
    __tablename__ = "players"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: new_id(ID_PREFIX)
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    # Members are the team, and the ladder is theirs. Guests are people who
    # turned up to be measured; they still affect every rating, they are just
    # not ranked unless the caller asks for them.
    is_guest: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Set by an admin's judgement when the player is added. There is no
    # server-side default on purpose: someone joining an established field is
    # not a 1000-rated player.
    entry_rating: Mapped[float] = mapped_column(Float, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Null means "cannot log in yet". Guests never get a pin.
    pin_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False, default=utcnow)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Player {self.id} {self.name!r}>"
