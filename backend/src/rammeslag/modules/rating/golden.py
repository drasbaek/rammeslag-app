"""Building the golden snapshot.

Pure like `engine.py`: these functions take and return plain data. All file
I/O lives in `scripts/regenerate_fixture.py` and in the tests, so the whole
rating module stays importable without touching a disk.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from . import constants
from .engine import MatchInput, RatingResult, compute


def parse_played_at(value: str) -> datetime:
    return datetime.fromisoformat(value)


def to_match_inputs(history: dict[str, Any]) -> list[MatchInput]:
    """The fixture's matches as engine input.

    Order is deliberately left as-stored; compute() sorts defensively.
    """
    return [
        MatchInput(
            match_id=match["id"],
            played_at=parse_played_at(match["played_at"]),
            team_a=(match["team_a"][0]["id"], match["team_a"][1]["id"]),
            team_b=(match["team_b"][0]["id"], match["team_b"][1]["id"]),
            games_a=match["games_a"],
            games_b=match["games_b"],
        )
        for match in history["matches"]
    ]


def to_entry_ratings(history: dict[str, Any]) -> dict[str, float]:
    """Each player's entry rating, as an admin set it.

    Absent players fall back to SEED_RATING inside compute().
    """
    return {
        player["id"]: float(player["entry_rating"])
        for player in history["players"]
        if player.get("entry_rating") is not None
    }


def build_expected(history: dict[str, Any], result: RatingResult) -> dict[str, Any]:
    """The golden snapshot, ladder first so a reviewer sees who moved."""
    names = {player["id"]: player["name"] for player in history["players"]}
    guests = {player["id"]: player["is_guest"] for player in history["players"]}
    entry = to_entry_ratings(history)

    ladder = [
        {
            "rank": rank,
            "player_id": player_id,
            "name": names.get(player_id, player_id),
            "is_guest": guests.get(player_id),
            "matches_played": result.matches_played[player_id],
            "entry_rating": entry.get(player_id),
            "rating": rating,
        }
        for rank, (player_id, rating) in enumerate(
            sorted(result.final.items(), key=lambda item: (-item[1], item[0])), start=1
        )
    ]

    return {
        "generated_from": "fixtures/history.json",
        "constants": {
            "SEED_RATING": constants.SEED_RATING,
            "K_STANDARD": constants.K_STANDARD,
            "K_PROVISIONAL": constants.K_PROVISIONAL,
            "PROVISIONAL_MATCHES": constants.PROVISIONAL_MATCHES,
            "MOV_SCALE": constants.MOV_SCALE,
            "ELO_SCALE": constants.ELO_SCALE,
        },
        "counts": {"players": len(result.final), "matches": len(result.history)},
        "ladder": ladder,
        "history": [
            {
                "match_id": delta.match_id,
                "played_at": delta.played_at.isoformat(),
                "verdict": dict(delta.verdict),
                "deltas": dict(delta.deltas),
                "ratings_after": dict(delta.ratings_after),
            }
            for delta in result.history
        ],
    }


def replay(history: dict[str, Any]) -> dict[str, Any]:
    """History in, golden snapshot out."""
    return build_expected(
        history, compute(to_match_inputs(history), to_entry_ratings(history))
    )


def render(payload: dict[str, Any]) -> str:
    """The canonical on-disk form. Regenerating must never produce a
    whitespace-only diff."""
    return json.dumps(payload, indent=2, ensure_ascii=False) + "\n"


def diff_ladders(before: dict[str, Any] | None, after: dict[str, Any]) -> list[str]:
    """Who moved, in the words a PR body needs.

    AGENTS.md hard rule 3: a change to the golden file must be explained.
    This produces the explanation.
    """
    if before is None:
        return ["no previous snapshot — this is the first generation"]

    old = {row["player_id"]: row for row in before.get("ladder", [])}
    new = {row["player_id"]: row for row in after["ladder"]}

    lines: list[str] = []
    for player_id, row in sorted(new.items(), key=lambda item: item[1]["rank"]):
        previous = old.get(player_id)
        if previous is None:
            lines.append(f"  + {row['name']:<22} {row['rating']:>9.2f}  (new)")
            continue
        moved = row["rating"] - previous["rating"]
        if abs(moved) > 1e-9:
            lines.append(
                f"    {row['name']:<22} {previous['rating']:>9.2f} -> "
                f"{row['rating']:>9.2f}  ({moved:+.2f})"
            )
    for player_id, row in old.items():
        if player_id not in new:
            lines.append(f"  - {row['name']:<22} (gone)")

    return lines or ["no rating changed"]
