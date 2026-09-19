# Rating specification

This document is normative. `modules/rating/engine.py` implements exactly
this and nothing else. Changing any constant or rule here requires
regenerating `fixtures/expected_ratings.json` in the same commit.

## Inputs

Matches where `source = 'internal'`, replayed in chronological order by
`played_at`, ties broken by `created_at` then `id`. Every player starts at
**1000.0**.

Only the game totals matter. Sets are stored and displayed, but the engine
reads `games_a` and `games_b`, each the sum over the match's sets.

## Per match

Team rating is the mean of its two players:

    R_a = (rating[a1] + rating[a2]) / 2
    R_b = (rating[b1] + rating[b2]) / 2

Expected score for team A, standard logistic on a 400-point scale:

    E_a = 1 / (1 + 10 ** ((R_b - R_a) / 400))
    E_b = 1 - E_a

Observed score comes from total games won, not sets:

    S_a = 1.0  if games_a > games_b
          0.0  if games_a < games_b
          0.5  if games_a == games_b

Margin multiplier, proportional because match length varies from 7 to 24
games:

    total = games_a + games_b
    mov   = 1 + abs(games_a - games_b) / total

If `total == 0` the match does not affect ratings at all.

Each player has their own K, so newcomers converge without making veterans
volatile:

    K_i = 40.0  if that player has played fewer than 5 matches so far
          20.0  otherwise

"So far" means matches already applied during this replay, counted before
this match is applied.

Finally, for each player i on team T:

    rating[i] += K_i * mov * (S_T - E_T)

Because K is per player, a match is not strictly zero-sum while anyone is
provisional. That is intended.

## Properties that must hold

- **Winning always gains rating.** `S_T - E_T > 0` whenever team T wins,
  since `E_T < 1` always. Any change that breaks this is a bug, not a
  tuning decision.
- **Replay is deterministic.** Same inputs, same outputs, bit for bit.
- **Deleting a match is a full replay**, never an inverse update.

## Constants

| Name | Value |
|---|---|
| `SEED_RATING` | 1000.0 |
| `K_STANDARD` | 20.0 |
| `K_PROVISIONAL` | 40.0 |
| `PROVISIONAL_MATCHES` | 5 |
| `MOV_SCALE` | 1.0 |
| `ELO_SCALE` | 400.0 |

All six live in `modules/rating/constants.py` and nowhere else.

## Set verdicts are display only

A set is shown as won when a team leads by two or more games, or at 7-6.
Anything else counts for neither side — these are timed sessions, so sets
end unfinished at 4-3 or 5-4 routinely.

This rule does **not** feed the rating. Across all 98 historical matches the
set verdict and the games verdict never disagree; games merely resolves 11
matches that sets leaves level.

## Derived views

**Form** is the last five match verdicts for a player: W, L or D by games.

**Season standing** ranks players by rating gained within a season's date
range. The all-time rating never resets.

**Active** means the player has appeared in a match in the current season.
The main ladder shows active players; everyone else remains viewable.
