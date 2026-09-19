#!/usr/bin/env python
"""Regenerate fixtures/expected_ratings.json from fixtures/history.json.

Run this whenever rating behaviour changes, in the SAME commit as the change.
It prints who moved so the PR body can say so — see hard rule 3 in AGENTS.md.

    uv run --directory backend python ../scripts/regenerate_fixture.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend" / "src"))

from rammeslag.modules.rating.golden import diff_ladders, render, replay  # noqa: E402

HISTORY_FILE = REPO_ROOT / "fixtures" / "history.json"
EXPECTED_FILE = REPO_ROOT / "fixtures" / "expected_ratings.json"


def read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    history = read_json(HISTORY_FILE)
    if history is None:
        print(f"missing {HISTORY_FILE.relative_to(REPO_ROOT)}", file=sys.stderr)
        return 1

    before = read_json(EXPECTED_FILE)
    after = replay(history)

    EXPECTED_FILE.write_text(render(after), encoding="utf-8")
    print(f"wrote {EXPECTED_FILE.relative_to(REPO_ROOT)}\n")

    print("Ladder:")
    for row in after["ladder"]:
        flag = " (guest)" if row["is_guest"] else ""
        print(
            f"  {row['rank']:>2}. {row['name']:<22} {row['rating']:>9.2f}"
            f"  {row['matches_played']:>3} matches{flag}"
        )

    print("\nChanged by this regeneration:")
    for line in diff_ladders(before, after):
        print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
