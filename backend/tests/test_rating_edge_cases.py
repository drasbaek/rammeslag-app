"""Edge cases of the rules in docs/RATING.md, on hand-built matches."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from rammeslag.modules.rating import MatchInput, compute
from rammeslag.modules.rating.constants import (
    K_PROVISIONAL,
    K_STANDARD,
    MOV_SCALE,
    PROVISIONAL_MATCHES,
    SEED_RATING,
)
from rammeslag.modules.rating.engine import expected_score

START = datetime(2026, 1, 1, 18, 0, tzinfo=UTC)


def match(
    index: int,
    team_a: tuple[str, str],
    team_b: tuple[str, str],
    games_a: int,
    games_b: int,
) -> MatchInput:
    """A one-set match. Every score here has a 2+ game lead or is level, so
    the set verdict and the game count agree and these tests stay about K."""
    return MatchInput(
        match_id=f"match-{index:03d}",
        played_at=START + timedelta(minutes=index),
        team_a=team_a,
        team_b=team_b,
        sets=((games_a, games_b),),
    )


def sets_match(
    index: int,
    team_a: tuple[str, str],
    team_b: tuple[str, str],
    sets: tuple[tuple[int, int], ...],
) -> MatchInput:
    return MatchInput(
        match_id=f"match-{index:03d}",
        played_at=START + timedelta(minutes=index),
        team_a=team_a,
        team_b=team_b,
        sets=sets,
    )


def test_equal_games_is_a_draw_and_moves_nobody_from_level_ratings() -> None:
    """games_a == games_b gives S = 0.5 to both sides."""
    result = compute([match(1, ("a1", "a2"), ("b1", "b2"), 6, 6)])

    delta = result.history[0]
    assert set(delta.verdict.values()) == {"D"}
    for player_id in ("a1", "a2", "b1", "b2"):
        assert delta.deltas[player_id] == 0.0
        assert result.final[player_id] == SEED_RATING
        assert result.matches_played[player_id] == 1


def test_a_draw_between_unequal_teams_still_moves_ratings() -> None:
    """S = 0.5 for both, but the favourite's expectation is above 0.5."""
    matches = [
        match(1, ("strong1", "strong2"), ("weak1", "weak2"), 12, 0),
        match(2, ("strong1", "strong2"), ("weak1", "weak2"), 6, 6),
    ]
    result = compute(matches)

    drawn = result.history[1]
    assert set(drawn.verdict.values()) == {"D"}
    assert drawn.deltas["strong1"] < 0.0
    assert drawn.deltas["weak1"] > 0.0


def test_zero_total_games_has_no_rating_effect() -> None:
    """`If total == 0 the match does not affect ratings at all.`"""
    matches = [
        match(1, ("a1", "a2"), ("b1", "b2"), 9, 3),
        match(2, ("a1", "a2"), ("b1", "b2"), 0, 0),
    ]
    result = compute(matches)

    after_first = result.history[0].ratings_after
    blank = result.history[1]
    for player_id in ("a1", "a2", "b1", "b2"):
        assert blank.deltas[player_id] == 0.0
        assert blank.ratings_after[player_id] == after_first[player_id]
        assert result.final[player_id] == after_first[player_id]
    assert set(blank.verdict.values()) == {"D"}


def test_first_five_matches_use_the_provisional_k_and_the_sixth_does_not() -> None:
    """K is per player and counted before the match is applied."""
    # The tracked player wins every match 8-4 alongside a fresh partner against
    # two fresh opponents, so every pre-match rating is known: the partner and
    # both opponents sit at the seed, and the rookie carries whatever the
    # previous matches gave them. That pins K exactly.
    matches = [
        match(index, ("rookie", f"partner{index}"), (f"x{index}", f"y{index}"), 8, 4)
        for index in range(1, PROVISIONAL_MATCHES + 2)
    ]
    result = compute(matches)

    mov = 1.0 + MOV_SCALE * 4 / 12
    rookie_before = SEED_RATING
    implied_k = []
    for delta in result.history:
        team_a = (rookie_before + SEED_RATING) / 2.0
        expected_a = expected_score(team_a, SEED_RATING)
        implied_k.append(delta.deltas["rookie"] / (mov * (1.0 - expected_a)))
        rookie_before = delta.ratings_after["rookie"]

    assert len(implied_k) == PROVISIONAL_MATCHES + 1
    for k in implied_k[:PROVISIONAL_MATCHES]:
        assert k == pytest.approx(K_PROVISIONAL)
    assert implied_k[PROVISIONAL_MATCHES] == pytest.approx(K_STANDARD)
    assert result.matches_played["rookie"] == PROVISIONAL_MATCHES + 1


def test_a_provisional_player_moves_exactly_twice_as_far_as_a_veteran() -> None:
    """Same team, same match: only K differs, so the ratio is K_PROVISIONAL / K_STANDARD."""
    warmup = [
        match(index, ("veteran", f"p{index}"), (f"x{index}", f"y{index}"), 7, 5)
        for index in range(1, PROVISIONAL_MATCHES + 1)
    ]
    together = match(50, ("veteran", "rookie"), ("o1", "o2"), 9, 3)
    result = compute([*warmup, together])

    last = result.history[-1]
    assert result.matches_played["veteran"] == PROVISIONAL_MATCHES + 1
    assert last.deltas["rookie"] == pytest.approx(
        last.deltas["veteran"] * (K_PROVISIONAL / K_STANDARD)
    )


def test_k_is_per_player_so_a_match_need_not_be_zero_sum() -> None:
    """A veteran against newcomers: the sides move by different amounts."""
    warmup = [
        match(index, ("vet1", "vet2"), (f"x{index}", f"y{index}"), 8, 4)
        for index in range(1, PROVISIONAL_MATCHES + 1)
    ]
    decider = match(90, ("vet1", "vet2"), ("new1", "new2"), 8, 4)
    result = compute([*warmup, decider])

    last = result.history[-1]
    assert last.deltas["vet1"] > 0.0
    assert last.deltas["new1"] < 0.0
    assert abs(last.deltas["vet1"]) != abs(last.deltas["new1"])


def test_matches_are_sorted_by_played_at_then_match_id() -> None:
    simultaneous = [
        MatchInput("match-b", START, ("a1", "a2"), ("b1", "b2"), ((8, 4),)),
        MatchInput("match-a", START, ("a1", "a2"), ("b1", "b2"), ((4, 8),)),
    ]
    forward = compute(simultaneous)
    backward = compute(list(reversed(simultaneous)))

    assert [delta.match_id for delta in forward.history] == ["match-a", "match-b"]
    assert forward.final == backward.final


def test_entry_ratings_seed_individual_players() -> None:
    """An admin sets a newcomer's entry rating by judgement; absent players
    fall back to SEED_RATING."""
    from datetime import UTC, datetime

    from rammeslag.modules.rating.constants import SEED_RATING
    from rammeslag.modules.rating.engine import MatchInput, compute

    match = MatchInput(
        match_id="m1",
        played_at=datetime(2026, 9, 1, tzinfo=UTC),
        team_a=("strong", "ordinary"),
        team_b=("weak", "unlisted"),
        sets=((6, 4),),
    )
    result = compute([match], entry_ratings={"strong": 1300.0, "weak": 700.0})

    # The listed pair started where they were told to; the rest at the seed.
    assert result.history[0].ratings_after["strong"] > 1300.0
    assert result.history[0].ratings_after["weak"] < 700.0
    ordinary_delta = result.history[0].deltas["ordinary"]
    assert result.final["ordinary"] == SEED_RATING + ordinary_delta

    # A heavily favoured team gains far less for the same win than an evenly
    # matched one would.
    even = compute([match])
    assert 0 < result.history[0].deltas["strong"] < even.history[0].deltas["strong"] / 3


def test_compute_without_entry_ratings_is_unchanged() -> None:
    """The parameter is optional; omitting it seeds everyone at SEED_RATING."""
    from datetime import UTC, datetime

    from rammeslag.modules.rating.constants import SEED_RATING
    from rammeslag.modules.rating.engine import MatchInput, compute

    match = MatchInput("m1", datetime(2026, 9, 1, tzinfo=UTC), ("a", "b"), ("c", "d"), ((6, 4),))
    assert compute([match]) == compute([match], entry_ratings={})
    assert compute([match], entry_ratings={"a": SEED_RATING}) == compute([match])


def test_sets_decide_the_match_even_when_games_disagree() -> None:
    """6-0 6-7 6-7 is 18-14 on games and 1-2 on sets. Sets win the argument."""
    result = compute([sets_match(1, ("a1", "a2"), ("b1", "b2"), ((6, 0), (6, 7), (6, 7)))])

    delta = result.history[0]
    assert delta.verdict["b1"] == "W"
    assert delta.verdict["a1"] == "L"
    assert delta.deltas["b1"] > 0.0
    assert delta.deltas["a1"] < 0.0


def test_a_set_winner_who_lost_the_game_count_gets_no_margin_bonus() -> None:
    """The margin follows the winner, and theirs is negative, so mov is 1.0."""
    outplayed = compute(
        [sets_match(1, ("a1", "a2"), ("b1", "b2"), ((6, 0), (6, 7), (6, 7)))]
    ).history[0]
    # Same sets won, but B also took the game count 14-18 -> 18-14 the other way.
    convincing = compute(
        [sets_match(1, ("a1", "a2"), ("b1", "b2"), ((0, 6), (7, 6), (6, 7)))]
    ).history[0]

    assert outplayed.deltas["b1"] == pytest.approx(K_PROVISIONAL * 0.5)
    assert convincing.deltas["b1"] > outplayed.deltas["b1"]


def test_games_break_a_tie_on_sets() -> None:
    """One set each and the third unfinished: the game count decides."""
    result = compute([sets_match(1, ("a1", "a2"), ("b1", "b2"), ((6, 2), (3, 6), (4, 3)))])

    delta = result.history[0]
    assert delta.verdict["a1"] == "W"  # 13-11 on games
    assert delta.deltas["a1"] > 0.0


def test_a_level_set_counts_for_neither_side() -> None:
    """A single 4-3 set is nobody's set, and 4-3 on games still decides it."""
    result = compute([sets_match(1, ("a1", "a2"), ("b1", "b2"), ((4, 3),))])

    delta = result.history[0]
    assert delta.verdict["a1"] == "W"
    assert delta.deltas["a1"] == pytest.approx(K_PROVISIONAL * (1.0 + MOV_SCALE / 7) * 0.5)


def test_level_on_sets_and_on_games_is_a_draw() -> None:
    result = compute([sets_match(1, ("a1", "a2"), ("b1", "b2"), ((4, 3), (3, 4)))])

    delta = result.history[0]
    assert set(delta.verdict.values()) == {"D"}
    for player_id in ("a1", "a2", "b1", "b2"):
        assert delta.deltas[player_id] == 0.0


def test_a_set_is_won_at_seven_six() -> None:
    """7-6 is the tiebreak, so it is a set. 6-5 is not."""
    tiebreak = compute([sets_match(1, ("a1", "a2"), ("b1", "b2"), ((7, 6), (5, 6)))]).history[0]
    assert tiebreak.verdict["a1"] == "W"  # sets 1-0, the 5-6 counts for nobody

    one_game = compute([sets_match(1, ("a1", "a2"), ("b1", "b2"), ((6, 5), (5, 6)))]).history[0]
    assert set(one_game.verdict.values()) == {"D"}  # no sets, 11-11 on games


def test_game_totals_derive_from_the_sets() -> None:
    match = sets_match(1, ("a1", "a2"), ("b1", "b2"), ((6, 4), (3, 6), (7, 6)))
    assert match.games_a == 16
    assert match.games_b == 16
