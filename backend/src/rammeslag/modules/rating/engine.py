"""The rating engine.

A pure replay of docs/RATING.md. No I/O, no database, no FastAPI, no
SQLAlchemy. Ratings are computed by replaying every match from the seed
rating; nothing is ever updated incrementally.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

from .constants import (
    ELO_SCALE,
    K_PROVISIONAL,
    K_STANDARD,
    MOV_SCALE,
    PROVISIONAL_MATCHES,
    SEED_RATING,
)

WIN = "W"
LOSS = "L"
DRAW = "D"


@dataclass(frozen=True)
class MatchInput:
    """One internal match, reduced to what the rating depends on."""

    match_id: str
    played_at: datetime
    team_a: tuple[str, str]
    team_b: tuple[str, str]
    games_a: int
    games_b: int


@dataclass(frozen=True)
class MatchDelta:
    """What one match did to the four players in it."""

    match_id: str
    played_at: datetime
    ratings_after: dict[str, float]
    deltas: dict[str, float]
    verdict: dict[str, str]


@dataclass(frozen=True)
class RatingResult:
    """The state of the ladder after replaying every match."""

    final: dict[str, float]
    history: list[MatchDelta]
    matches_played: dict[str, int]


def expected_score(rating_for: float, rating_against: float) -> float:
    """Standard logistic expectation on a 400-point scale."""
    return 1.0 / (1.0 + 10.0 ** ((rating_against - rating_for) / ELO_SCALE))


def observed_score(games_for: int, games_against: int) -> float:
    """Observed score from total games won, not sets."""
    if games_for > games_against:
        return 1.0
    if games_for < games_against:
        return 0.0
    return 0.5


def margin_multiplier(games_a: int, games_b: int) -> float:
    """Proportional margin term, because match length varies from 7 to 24 games."""
    total = games_a + games_b
    return 1.0 + MOV_SCALE * abs(games_a - games_b) / total


def k_factor(matches_so_far: int) -> float:
    """A player's own K, counted before this match is applied."""
    return K_PROVISIONAL if matches_so_far < PROVISIONAL_MATCHES else K_STANDARD


def _verdict(score: float) -> str:
    if score == 1.0:
        return WIN
    if score == 0.0:
        return LOSS
    return DRAW


def compute(
    matches: Sequence[MatchInput],
    entry_ratings: Mapping[str, float] | None = None,
) -> RatingResult:
    """Replay `matches` from each player's entry rating and return the ladder.

    `entry_ratings` maps player id to the rating that player entered the
    ladder at. An admin sets it by judgement when adding someone, because a
    newcomer joining an established field is not a 1000-rated player. Anyone
    absent from the mapping falls back to SEED_RATING.

    Input order is not trusted: matches are sorted by `played_at`, ties broken
    by `match_id`.
    """
    entry = dict(entry_ratings or {})
    ratings: dict[str, float] = {}
    matches_played: dict[str, int] = {}
    history: list[MatchDelta] = []

    def seed(player_id: str) -> None:
        if player_id not in ratings:
            ratings[player_id] = entry.get(player_id, SEED_RATING)
            matches_played[player_id] = 0

    for match in sorted(matches, key=lambda m: (m.played_at, m.match_id)):
        team_a = tuple(match.team_a)
        team_b = tuple(match.team_b)
        for player_id in team_a + team_b:
            seed(player_id)

        score_a = observed_score(match.games_a, match.games_b)
        score_b = observed_score(match.games_b, match.games_a)

        rating_a = (ratings[team_a[0]] + ratings[team_a[1]]) / 2.0
        rating_b = (ratings[team_b[0]] + ratings[team_b[1]]) / 2.0
        expected_a = expected_score(rating_a, rating_b)
        expected_b = 1.0 - expected_a

        total_games = match.games_a + match.games_b
        if total_games == 0:
            # A match with no games played does not affect ratings at all.
            deltas = {player_id: 0.0 for player_id in team_a + team_b}
        else:
            mov = margin_multiplier(match.games_a, match.games_b)
            deltas = {}
            sides = ((team_a, score_a, expected_a), (team_b, score_b, expected_b))
            for team, score, expected in sides:
                for player_id in team:
                    k = k_factor(matches_played[player_id])
                    deltas[player_id] = k * mov * (score - expected)

        for player_id, delta in deltas.items():
            ratings[player_id] += delta
            matches_played[player_id] += 1

        history.append(
            MatchDelta(
                match_id=match.match_id,
                played_at=match.played_at,
                ratings_after={pid: ratings[pid] for pid in team_a + team_b},
                deltas=deltas,
                verdict={
                    **{player_id: _verdict(score_a) for player_id in team_a},
                    **{player_id: _verdict(score_b) for player_id in team_b},
                },
            )
        )

    return RatingResult(final=dict(ratings), history=history, matches_played=dict(matches_played))
