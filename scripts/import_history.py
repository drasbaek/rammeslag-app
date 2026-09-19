#!/usr/bin/env python3
"""Load the real padel history into a database. LOCAL ONLY, run by a human.

No agent runs this. It reads ``export/padel_history.json`` -- which is
gitignored and lives on one laptop -- and writes players, seasons, sessions,
matches and sets into whatever DATABASE_URL points at.

    uv run --directory backend python ../scripts/import_history.py \
        --database-url "postgresql://..." --confirm

It is idempotent: running it twice changes nothing the second time. It refuses
to do anything without --confirm.

Matches are grouped into sessions by calendar date -- the history has 16
session dates -- and into the two seasons below.

``scripts/player_overrides.json`` carries the two things the old app never
recorded: each player's entry rating and who has since been promoted from
guest to member. It is gitignored because it is keyed by real name.
``pseudonymize.py`` reads the same file with the same function, so the
committed fixture and the production database cannot drift apart.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_SRC = REPO_ROOT / "backend" / "src"
if BACKEND_SRC.is_dir() and str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))
SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

# One reader for the overrides file, shared with the fixture pipeline. A second
# implementation here is how the fixture and production start disagreeing.
from pseudonymize import load_overrides  # noqa: E402
from sqlalchemy import create_engine, select  # noqa: E402
from sqlalchemy.orm import Session as DbSession  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from rammeslag.db import normalize_database_url  # noqa: E402
from rammeslag.modules.matches.models import Match, MatchSet  # noqa: E402
from rammeslag.modules.players.models import Player  # noqa: E402
from rammeslag.modules.seasons.models import Season  # noqa: E402
from rammeslag.modules.sessions.models import Session as PlaySession  # noqa: E402

DEFAULT_EXPORT = REPO_ROOT / "export" / "padel_history.json"
DEFAULT_OVERRIDES = REPO_ROOT / "scripts" / "player_overrides.json"


@dataclass(frozen=True)
class SeasonSpec:
    id: str
    name: str
    starts_on: date
    ends_on: date

    def contains(self, day: date) -> bool:
        return self.starts_on <= day <= self.ends_on


SEASONS = (
    SeasonSpec("season-efteraar-2025", "Efterår 2025", date(2025, 8, 25), date(2025, 11, 16)),
    SeasonSpec("season-foraar-2026", "Forår 2026", date(2026, 1, 12), date(2026, 3, 16)),
)


def parse_timestamp(raw: str) -> datetime:
    value = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)


def season_for(day: date) -> SeasonSpec:
    for season in SEASONS:
        if season.contains(day):
            return season
    raise SystemExit(f"No season covers {day.isoformat()}. Refusing to guess.")


def session_id_for(day: date) -> str:
    """Deterministic, so a second run finds the same session instead of a twin."""
    return f"session-{day.isoformat()}"


class Counters:
    def __init__(self) -> None:
        self.data: dict[str, int] = defaultdict(int)

    def bump(self, key: str) -> None:
        self.data[key] += 1

    def report(self) -> str:
        return ", ".join(f"{key}={value}" for key, value in sorted(self.data.items()))


def upsert_seasons(db: DbSession, counters: Counters) -> None:
    for spec in SEASONS:
        existing = db.get(Season, spec.id)
        if existing is None:
            db.add(
                Season(
                    id=spec.id, name=spec.name, starts_on=spec.starts_on, ends_on=spec.ends_on
                )
            )
            counters.bump("seasons_created")
        else:
            existing.name = spec.name
            existing.starts_on = spec.starts_on
            existing.ends_on = spec.ends_on
            counters.bump("seasons_unchanged")
    db.flush()


@dataclass(frozen=True)
class Overrides:
    """The admin judgements the export does not carry, keyed by real name."""

    entry_ratings: dict[str, float]
    default_entry_rating: float
    promoted_to_member: set[str]

    def entry_rating_for(self, name: str) -> float:
        return self.entry_ratings.get(name, self.default_entry_rating)

    def is_guest_for(self, name: str, exported: bool) -> bool:
        """The export's guest flag is a snapshot; a promotion outranks it."""
        return False if name in self.promoted_to_member else exported

    def unmatched(self, names: set[str]) -> list[str]:
        """Override keys that match nobody -- almost always a typo."""
        return sorted((set(self.entry_ratings) | self.promoted_to_member) - names)


def read_overrides(path: Path) -> Overrides:
    """Read the overrides with pseudonymize.py's own reader, not a second one."""
    entry_ratings, default_rating, promoted = load_overrides(path)
    return Overrides(entry_ratings, default_rating, promoted)


def upsert_players(
    db: DbSession, players: list[dict], overrides: Overrides, counters: Counters
) -> None:
    """Players, with their entry rating and current member status applied.

    ``entry_rating`` is NOT NULL and has no server default, so every player
    gets one here: the override for their name, or the file's default.
    """
    unmatched = overrides.unmatched({record["name"] for record in players})
    if unmatched:
        raise SystemExit(
            "player_overrides.json names nobody in the export: "
            + ", ".join(repr(name) for name in unmatched)
        )

    for record in players:
        name = record["name"]
        entry_rating = overrides.entry_rating_for(name)
        is_guest = overrides.is_guest_for(name, bool(record.get("is_guest", False)))
        if entry_rating != overrides.default_entry_rating:
            counters.bump("entry_ratings_overridden")
        if name in overrides.promoted_to_member:
            counters.bump("promoted_to_member")

        existing = db.get(Player, record["id"])
        if existing is None:
            db.add(
                Player(
                    id=record["id"],
                    name=name,
                    is_guest=is_guest,
                    is_admin=False,
                    entry_rating=entry_rating,
                    # Pins are set by a human afterwards, never imported.
                    pin_hash=None,
                    created_at=parse_timestamp(
                        record.get("registered_at") or record["first_match_at"]
                    ),
                )
            )
            counters.bump("players_created")
        else:
            # Re-running after editing the overrides file is the supported way
            # to correct an entry rating or promote a guest.
            changed = (
                existing.name != name
                or existing.is_guest != is_guest
                or existing.entry_rating != entry_rating
            )
            existing.name = name
            existing.is_guest = is_guest
            existing.entry_rating = entry_rating
            counters.bump("players_updated" if changed else "players_unchanged")
    db.flush()


def upsert_sessions(db: DbSession, matches: list[dict], counters: Counters) -> dict[date, str]:
    """One session per calendar date. The history has 16 of them."""
    days = sorted({parse_timestamp(m["played_at"]).date() for m in matches})
    by_day: dict[date, str] = {}
    for day in days:
        spec = season_for(day)
        session_id = session_id_for(day)
        by_day[day] = session_id
        existing = db.get(PlaySession, session_id)
        if existing is None:
            db.add(
                PlaySession(
                    id=session_id,
                    season_id=spec.id,
                    played_on=day,
                    type="training",
                    status="closed",
                    note=None,
                    # No creator: the old app recorded none.
                    created_by=None,
                    created_at=datetime(day.year, day.month, day.day, tzinfo=UTC),
                )
            )
            counters.bump("sessions_created")
        else:
            existing.season_id = spec.id
            existing.played_on = day
            counters.bump("sessions_unchanged")
    db.flush()
    return by_day


def upsert_matches(
    db: DbSession, matches: list[dict], sessions_by_day: dict[date, str], counters: Counters
) -> None:
    known_players = set(db.execute(select(Player.id)).scalars().all())
    for record in sorted(matches, key=lambda m: m["match_order"]):
        played_at = parse_timestamp(record["played_at"])
        team_a = [p["id"] for p in record["team_a"]]
        team_b = [p["id"] for p in record["team_b"]]
        everyone = [*team_a, *team_b]
        if len(set(everyone)) != 4:
            raise SystemExit(f"{record['id']} does not have four distinct players.")
        missing = [pid for pid in everyone if pid not in known_players]
        if missing:
            raise SystemExit(f"{record['id']} references unknown players: {missing}")

        sets = [(int(s["score_a"]), int(s["score_b"])) for s in record["sets"]]
        if not 1 <= len(sets) <= 3:
            raise SystemExit(f"{record['id']} has {len(sets)} sets; expected one to three.")
        if any(a < 0 or b < 0 for a, b in sets):
            raise SystemExit(f"{record['id']} has a negative game count.")
        if sum(a + b for a, b in sets) == 0:
            raise SystemExit(f"{record['id']} has no games at all.")

        existing = db.get(Match, record["id"])
        if existing is None:
            match = Match(
                id=record["id"],
                session_id=sessions_by_day[played_at.date()],
                played_at=played_at,
                source="internal",
                team_a_player1_id=team_a[0],
                team_a_player2_id=team_a[1],
                team_b_player1_id=team_b[0],
                team_b_player2_id=team_b[1],
                created_by=None,
                created_at=played_at,
            )
            for number, (games_a, games_b) in enumerate(sets, start=1):
                match.sets.append(
                    MatchSet(
                        id=f"{record['id']}-s{number}",
                        set_number=number,
                        games_a=games_a,
                        games_b=games_b,
                    )
                )
            db.add(match)
            counters.bump("matches_created")
        else:
            counters.bump("matches_unchanged")
    db.flush()


def run_import(db: DbSession, payload: dict, overrides: Overrides) -> Counters:
    counters = Counters()
    upsert_seasons(db, counters)
    upsert_players(db, payload["players"], overrides, counters)
    sessions_by_day = upsert_sessions(db, payload["matches"], counters)
    upsert_matches(db, payload["matches"], sessions_by_day, counters)
    return counters


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", type=Path, default=DEFAULT_EXPORT, help="padel_history.json")
    parser.add_argument(
        "--overrides",
        type=Path,
        default=DEFAULT_OVERRIDES,
        help="Entry ratings and guest promotions, keyed by real name. Gitignored.",
    )
    parser.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL", ""),
        help="Target database. Defaults to $DATABASE_URL.",
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Required. Without it nothing is written and nothing is read.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Do the whole import in a transaction and roll it back.",
    )
    args = parser.parse_args(argv)

    if not args.confirm:
        parser.error(
            "Refusing to run without --confirm. This writes real player data into "
            f"{args.database_url or '$DATABASE_URL'}."
        )
    if not args.database_url:
        parser.error("No database. Pass --database-url or set DATABASE_URL.")
    if not args.file.is_file():
        parser.error(f"{args.file} does not exist.")

    payload = json.loads(args.file.read_text(encoding="utf-8"))
    overrides = read_overrides(args.overrides)
    if not args.overrides.exists():
        print(
            f"note: {args.overrides} is missing; every player enters at "
            f"{overrides.default_entry_rating:.0f} and the export's guest flags stand."
        )
    engine = create_engine(normalize_database_url(args.database_url), future=True)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    with factory() as db:
        counters = run_import(db, payload, overrides)
        if args.dry_run:
            db.rollback()
            print(f"dry run, rolled back: {counters.report()}")
        else:
            db.commit()
            print(f"imported: {counters.report()}")
    engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
