#!/usr/bin/env python
"""Give a player a pin, and optionally make them an admin.

This exists to break a bootstrap deadlock. The history import creates every
player with no pin and no admin rights, because the export has no
credentials. Without this there is no admin to grant anyone access, so the
app is permanently read-only.

Run it once for yourself. After that, set everyone else's pin from the admin
screen in the app -- this script is the way in, not the way to manage a team.

    uv run --directory backend python ../scripts/grant_access.py \
        --name "Some Player" --admin --confirm

The pin is prompted for, never passed as an argument: an argument lands in
shell history and in the process list.
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend" / "src"))

PIN_LENGTH = 4


def load_database_url(explicit: str | None) -> str:
    if explicit:
        return explicit
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    env = REPO_ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("DATABASE_URL_DIRECT="):
                return line.split("=", 1)[1].strip()
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip()
    raise SystemExit("No database. Set DATABASE_URL or pass --database-url.")


def prompt_pin() -> str:
    first = getpass.getpass(f"New {PIN_LENGTH}-digit pin: ")
    if not (first.isdigit() and len(first) == PIN_LENGTH):
        raise SystemExit(f"The pin must be exactly {PIN_LENGTH} digits.")
    if first != getpass.getpass("Repeat it: "):
        raise SystemExit("The two pins do not match. Nothing was changed.")
    return first


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", required=True, help="The player's name, as stored.")
    parser.add_argument("--admin", action="store_true", help="Also grant admin rights.")
    parser.add_argument("--database-url", default=None)
    parser.add_argument("--confirm", action="store_true", help="Required. Writes nothing without it.")
    args = parser.parse_args()

    if not args.confirm:
        raise SystemExit("Refusing to write without --confirm.")

    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session as DbSession

    from rammeslag.db import normalize_database_url
    from rammeslag.modules.players.models import Player
    from rammeslag.modules.players.service import hash_pin

    # Reuse the app's own normaliser: a bare postgresql:// URL resolves to
    # psycopg2, which is not installed. One definition of that fix.
    engine = create_engine(normalize_database_url(load_database_url(args.database_url)))
    with DbSession(engine) as db:
        matches = db.scalars(select(Player).where(Player.name.ilike(args.name))).all()
        if not matches:
            near = db.scalars(
                select(Player).where(Player.name.ilike(f"%{args.name}%")).limit(5)
            ).all()
            hint = "\n".join(f"  {p.name}" for p in near)
            raise SystemExit(
                f"No player called {args.name!r}." + (f" Did you mean:\n{hint}" if hint else "")
            )
        if len(matches) > 1:
            raise SystemExit(f"{len(matches)} players match {args.name!r}. Be more specific.")

        player = matches[0]
        player.pin_hash = hash_pin(prompt_pin())
        if args.admin:
            player.is_admin = True
        db.commit()

        role = "admin" if player.is_admin else "player"
        print(f"{player.name}: pin set, role {role}.")
        from sqlalchemy import func

        admins = db.scalar(select(func.count()).select_from(Player).where(Player.is_admin)) or 0
        with_pin = db.scalar(
            select(func.count()).select_from(Player).where(Player.pin_hash.is_not(None))
        ) or 0
        print(f"{admins} admin(s), {with_pin} player(s) with a pin.")
        if not admins:
            print("WARNING: still no admin. Re-run with --admin.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
