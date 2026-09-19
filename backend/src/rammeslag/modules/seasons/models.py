"""Season ORM model."""

from __future__ import annotations

from datetime import date

from sqlalchemy import Date, String
from sqlalchemy.orm import Mapped, mapped_column

from rammeslag.db import Base, new_id

ID_PREFIX = "season"


class Season(Base):
    __tablename__ = "seasons"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: new_id(ID_PREFIX)
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    # Inclusive on both ends. A session's date must fall inside exactly one season.
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    ends_on: Mapped[date] = mapped_column(Date, nullable=False)

    def contains(self, day: date) -> bool:
        return self.starts_on <= day <= self.ends_on

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Season {self.id} {self.name!r}>"
