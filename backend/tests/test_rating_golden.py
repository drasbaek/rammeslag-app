"""The golden fixture test.

The most important test in this repo. Replaying fixtures/history.json must
reproduce fixtures/expected_ratings.json exactly. That invariant is what
stops a refactor of the rating engine from silently rewriting the team's
real ladder.

If this fails and you meant it to, regenerate and explain the diff:

    uv run --directory backend python ../scripts/regenerate_fixture.py
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from rammeslag.modules.rating import compute
from rammeslag.modules.rating.golden import render, replay, to_match_inputs

REPO_ROOT = Path(__file__).resolve().parents[2]
HISTORY_FILE = REPO_ROOT / "fixtures" / "history.json"
EXPECTED_FILE = REPO_ROOT / "fixtures" / "expected_ratings.json"

REGENERATE = "uv run --directory backend python ../scripts/regenerate_fixture.py"


def load_history() -> dict[str, Any]:
    return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))


def test_golden_fixture_is_reproduced_exactly() -> None:
    assert EXPECTED_FILE.exists(), f"missing golden snapshot; regenerate with `{REGENERATE}`"
    expected = json.loads(EXPECTED_FILE.read_text(encoding="utf-8"))
    assert replay(load_history()) == expected, (
        "The rating engine no longer reproduces the committed ladder. If this "
        f"was intended, regenerate with `{REGENERATE}` and explain in the PR "
        "body exactly who moved and why."
    )


def test_golden_fixture_is_canonically_formatted() -> None:
    """The committed file is byte-identical to what a regeneration writes, so
    regenerating never produces a whitespace-only diff."""
    assert EXPECTED_FILE.read_text(encoding="utf-8") == render(replay(load_history()))


def test_every_fixture_player_has_a_rating() -> None:
    history = load_history()
    result = compute(to_match_inputs(history))
    assert set(result.final) == {player["id"] for player in history["players"]}
    assert sum(result.matches_played.values()) == 4 * len(history["matches"])
