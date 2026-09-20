"""Event ORM models: the things people answer *before* they happen.

A ``session`` is retrospective -- an evening defined by the matches that were
played on it. An ``event`` is the opposite: a date in the future that people
say yes or no to. Keeping them apart is deliberate. Folding a planned Sunday
into ``sessions`` would put empty future rows into the history list and into
every reader that walks sessions, and none of those readers asked for a
calendar.

Two kinds live here, and the difference is ``type``:

``match``     A league fixture against another club. Availability plus the
              squad an admin picks. No score is ever recorded; these are not
              internal doubles and nothing here reaches the rating engine.
``training``  Sunday training. Availability plus a court count, and -- once it
              has been played -- a link to the ``session`` its results went
              into.

Nothing in this module writes to ``matches`` or ``match_sets``. The planned
line-ups in :class:`EventMatchup` are a whiteboard; real matches are still
only created by score entry. That is what keeps ``fixtures/expected_ratings``
out of reach of everything below.
"""

from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import Date, ForeignKey, Integer, String, Text, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from rammeslag.db import Base, UtcDateTime, new_id, utcnow

ID_PREFIX = "event"

EVENT_TYPES = ("match", "training")

#: ``open``      anyone may answer and change their answer
#: ``locked``    the squad is picked; only an admin still edits
#: ``cancelled`` it is not happening. Kept rather than deleted, because
#:               "aflyst" is information and a deleted row is not.
EVENT_STATUSES = ("open", "locked", "cancelled")

RESPONSE_STATES = ("yes", "no", "maybe")

#: Four players to a padel court. A training's capacity is courts x this.
COURT_CAPACITY = 4

#: Three courts is the standing booking, so twelve spots is the default Sunday.
DEFAULT_TRAINING_COURTS = 3

#: A league fixture fields six. This is the number the old spreadsheet's
#: "Spillere i over- eller underskud" row was subtracting from.
DEFAULT_SQUAD_SIZE = 6


class Event(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: new_id(ID_PREFIX)
    )
    # NOT NULL, same rule as sessions: a date outside every season is a
    # refusal, not a nullable column with a convention attached.
    season_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("seasons.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    held_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # Wall-clock time in Copenhagen, stored naive. "18:00" is what the old
    # sheet said and what a player reads; there is no second timezone in this
    # app to be wrong about.
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    venue: Mapped[str] = mapped_column(String(120), nullable=False)
    # Only a fixture has one. Free text, because the opponents are other
    # clubs' team names and we do not own that list.
    opponent: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # How many of us the event has room for: a fixture's squad size, or a
    # training's courts x 4. One column rather than two mutually-irrelevant
    # ones, and the training screen does the division back into baner.
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Nullable on purpose, and this is the one nullable FK in the schema.
    # AGENTS.md rule 6 forbids a nullable FK *where a type column would do* --
    # here one would not. A training has a session only after it has been
    # played, so this is optional state over time, not a discriminator.
    # Fixtures never get one at all: no league result reaches the ladder.
    session_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False, default=utcnow)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Event {self.id} {self.type} {self.held_on}>"


class EventResponse(Base):
    """One player's answer. No row means they have not answered.

    The old spreadsheet had a blank cell for that, and blank is genuinely
    different from "Ved ikke" -- one is a shrug, the other is silence. Storing
    absence as absence keeps the two apart without a fourth state.
    """

    __tablename__ = "event_responses"
    __table_args__ = (
        UniqueConstraint("event_id", "player_id", name="uq_event_responses_event_player"),
    )

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: new_id("response")
    )
    event_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    player_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("players.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    state: Mapped[str] = mapped_column(String(10), nullable=False)
    # Who wrote it. Normally the player themselves; for a guest it is the
    # member who brought them, which is the only record of whose guest it is.
    added_by: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False, default=utcnow)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<EventResponse {self.event_id} {self.player_id} {self.state}>"


class EventSelection(Base):
    """A player an admin has picked for a fixture.

    Separate from a yes-response on purpose, and the distinction is the whole
    point of the feature: being available is not being picked. Nothing derives
    one from the other.
    """

    __tablename__ = "event_selections"
    __table_args__ = (
        UniqueConstraint("event_id", "player_id", name="uq_event_selections_event_player"),
    )

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: new_id("selection")
    )
    event_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    player_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("players.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False, default=utcnow)


class EventMatchup(Base):
    """A planned line-up: round, court, and who is on each side.

    This is a whiteboard, not a result. It has no score and it never becomes a
    ``Match`` by itself -- score entry does that, from the same screen every
    other match is typed into. Deleting every row here cannot move a rating.
    """

    __tablename__ = "event_matchups"
    __table_args__ = (
        UniqueConstraint("event_id", "round", "court", name="uq_event_matchups_slot"),
    )

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: new_id("matchup")
    )
    event_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    round: Mapped[int] = mapped_column(Integer, nullable=False)
    court: Mapped[int] = mapped_column(Integer, nullable=False)

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

    @property
    def player_ids(self) -> tuple[str, str, str, str]:
        return (
            self.team_a_player1_id,
            self.team_a_player2_id,
            self.team_b_player1_id,
            self.team_b_player2_id,
        )
