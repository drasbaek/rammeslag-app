#!/usr/bin/env python3
"""Render the difference between two expected_ratings.json snapshots.

Prints the movement in the form a human reads without opening the file:

    Jacob Barsballe    1204.3 -> 1216.7   +12.4
    Jonas Lange        1188.0 -> 1180.0    -8.0

Used by the rating-fixture-guard CI job, by check_fixture_explained.py, and
by the `regenerate-fixture` skill, so the PR body, the CI summary and the
guard all describe the same movement.

The snapshot format is owned by the rating module: a top-level `ladder`
list of objects carrying `name` and `rating`. See
backend/src/rammeslag/modules/rating/golden.py.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path

#: Below this, a movement is float noise rather than a rating change.
EPSILON = 0.05


@dataclass(frozen=True)
class Movement:
    name: str
    old: float | None
    new: float | None

    @property
    def delta(self) -> float:
        return (self.new or 0.0) - (self.old or 0.0)

    def render(self, width: int) -> str:
        if self.old is None:
            return f"{self.name:<{width}}  new player at {self.new:.1f}"
        if self.new is None:
            return f"{self.name:<{width}}  removed (was {self.old:.1f})"
        return f"{self.name:<{width}}  {self.old:.1f} -> {self.new:.1f}   {self.delta:+.1f}"


def load_ladder(path: str | Path) -> dict[str, float]:
    """Read {name: rating} out of a snapshot. Empty dict if there is none."""
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    rows = payload.get("ladder")
    if not isinstance(rows, list):
        return {}
    return {
        str(row["name"]): float(row["rating"])
        for row in rows
        if isinstance(row, dict) and "name" in row and isinstance(row.get("rating"), (int, float))
    }


def movements(before: dict[str, float], after: dict[str, float]) -> list[Movement]:
    """Everyone whose rating actually moved, biggest absolute change first."""
    out = [
        Movement(name, before.get(name), after.get(name))
        for name in sorted(set(before) | set(after))
    ]
    changed = [m for m in out if m.old is None or m.new is None or abs(m.delta) >= EPSILON]
    return sorted(changed, key=lambda m: -abs(m.delta))


def main(before_path: str, after_path: str) -> int:
    before, after = load_ladder(before_path), load_ladder(after_path)
    if not before and not after:
        print("Could not read a `ladder` out of either snapshot.")
        print("Diff them by hand and describe the movement in the PR body.")
        return 0

    moved = movements(before, after)
    print("## Rating change")
    print()
    if not moved:
        print("No player's rating moved. The fixture changed in shape only")
        print("(formatting, key order, added metadata). Say so in the PR body.")
        return 0

    width = max(len(m.name) for m in moved)
    print("```")
    for movement in moved:
        print(movement.render(width))
    print("```")
    print()
    headline = ", ".join(
        f"{m.name.split()[0]} {m.delta:+.0f}" for m in moved[:3] if m.old and m.new
    )
    if headline:
        print(f"Headline: {headline}")
        print()
    print("Copy the block above into the PR body under `## Rating change`,")
    print("then add a `Why:` line saying which constant or rule moved and why.")
    print()
    print("The guard checks these numbers against the fixture. Inventing them fails CI.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: rating_diff.py <before.json> <after.json>", file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1], sys.argv[2]))
