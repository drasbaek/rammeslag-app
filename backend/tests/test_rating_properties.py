"""Properties docs/RATING.md declares must hold, checked against the fixture."""

from __future__ import annotations

import random

from rammeslag.modules.rating import compute
from rammeslag.modules.rating.constants import SEED_RATING
from tests.test_rating_golden import load_history, to_match_inputs


def _as_comparable(result) -> tuple:
    return (
        tuple(sorted(result.final.items())),
        tuple(sorted(result.matches_played.items())),
        tuple(
            (
                delta.match_id,
                delta.played_at,
                tuple(sorted(delta.deltas.items())),
                tuple(sorted(delta.ratings_after.items())),
                tuple(sorted(delta.verdict.items())),
            )
            for delta in result.history
        ),
    )


def test_winning_on_games_always_gains_rating() -> None:
    """Every winner in every fixture match gains. Never zero, never negative."""
    matches = to_match_inputs(load_history())
    result = compute(matches)

    checked = 0
    for delta in result.history:
        for player_id, verdict in delta.verdict.items():
            if verdict == "W":
                assert delta.deltas[player_id] > 0.0, (
                    f"{player_id} won match {delta.match_id} but moved "
                    f"{delta.deltas[player_id]}"
                )
                checked += 1
    assert checked > 0


def test_losing_on_games_always_loses_rating() -> None:
    matches = to_match_inputs(load_history())
    for delta in compute(matches).history:
        for player_id, verdict in delta.verdict.items():
            if verdict == "L":
                assert delta.deltas[player_id] < 0.0


def test_replay_is_deterministic() -> None:
    matches = to_match_inputs(load_history())
    assert _as_comparable(compute(matches)) == _as_comparable(compute(matches))


def test_input_order_does_not_matter() -> None:
    """compute() sorts by (played_at, match_id) instead of trusting the caller."""
    matches = to_match_inputs(load_history())
    reference = _as_comparable(compute(matches))

    assert _as_comparable(compute(list(reversed(matches)))) == reference

    rng = random.Random(20260919)
    for _ in range(5):
        shuffled = list(matches)
        rng.shuffle(shuffled)
        assert _as_comparable(compute(shuffled)) == reference


def test_no_matches_is_an_empty_ladder() -> None:
    result = compute([])
    assert result.final == {}
    assert result.history == []
    assert result.matches_played == {}


def test_every_player_starts_at_the_seed_rating() -> None:
    """The first match of the replay is played from 1000.0 by both teams."""
    matches = to_match_inputs(load_history())
    first = compute(matches).history[0]
    for player_id, delta in first.deltas.items():
        assert first.ratings_after[player_id] == SEED_RATING + delta
