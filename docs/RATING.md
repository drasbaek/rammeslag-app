# Rating specification

This document is normative. `modules/rating/engine.py` implements exactly
this and nothing else. Changing any constant or rule here requires
regenerating `fixtures/expected_ratings.json` in the same commit.

## Inputs

Matches where `source = 'internal'`, replayed in chronological order by
`played_at`, ties broken by `match_id`.

Every player starts at their own **entry rating**, a required field set by an
admin when the player is added. A newcomer joining an established field is
not a 1000-rated player, and the admin is better placed to judge that than
any formula. `SEED_RATING` is the suggested default and the fallback for a
player with no entry rating recorded.

The engine sorts defensively rather than trusting input order. `match_id` is
a weak tie-break — it is stable but arbitrary — so the matches module must
stamp `played_at` at entry time, which keeps matches within a session
distinct and in the order they were actually played.

**The old app's entry ratings are not inherited automatically.** `export/`
records that one player entered at 1100 and that this is required to
reconcile with the old system's numbers. The fixture preserves `entry_elo` as
provenance, but the engine reads entry ratings from the players table, which
an admin fills in deliberately. Until they are set, everyone falls back to
`SEED_RATING` and **these ratings will not reconcile with the old app's**.

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
    mov   = 1 + MOV_SCALE * abs(games_a - games_b) / total

`MOV_SCALE` multiplies the margin term, as written above. At 1.0 several
placements are numerically identical; this one is normative, and the others
diverge the moment anyone tunes it.

If `total == 0` no rating changes, but the match **does** count toward
`matches_played` and toward the provisional threshold — one counter, not two.
This is defensive only: the matches module rejects a match with no games at
write time, so it should never reach the engine from the app.

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
- **Losing always costs rating**, by the same argument. Both directions are
  guaranteed and both are tested against every fixture match.
- **A drawn match yields verdict `D`** for all four players, including a
  0-0 match.
- **Ratings are full float64.** The golden snapshot stores them at full
  precision so equality is bit-exact. Round only for display.
- **Replay is deterministic.** Same inputs, same outputs, bit for bit.
- **Deleting a match is a full replay**, never an inverse update.

## Constants

| Name | Value |
|---|---|
| `SEED_RATING` | 1000.0 (default and fallback, not a universal seed) |
| `K_STANDARD` | 20.0 |
| `K_PROVISIONAL` | 40.0 |
| `PROVISIONAL_MATCHES` | 5 |
| `MOV_SCALE` | 1.0 |
| `ELO_SCALE` | 400.0 |

All six live in `modules/rating/constants.py` and nowhere else.

## Validation is the caller's job

The engine trusts its input and computes. It does not reject a player
appearing twice in one match, a player partnered with themselves, or
negative game counts. Those are the matches module's rules, enforced before
anything is written:

- four distinct players
- every set's games are non-negative
- at least one game in total
- one to three sets

## Set verdicts are display only

A set is shown as won when a team leads by two or more games, or at 7-6.
Anything else counts for neither side — these are timed sessions, so sets
end unfinished at 4-3 or 5-4 routinely.

This rule does **not** feed the rating. Across all 98 historical matches the
set verdict and the games verdict never disagree; games merely resolves 11
matches that sets leaves level.

## Who appears on the ladder

`is_guest` is a meaningful distinction, not a stale flag: **members** are the
team, for whom rankings matter; **guests** turned up to be measured. Guest
status is editable, because guests become members.

- The ladder shows **members only by default**. Guests are available behind
  an explicit filter.
- There is **no activity filter.** A member who missed a season still appears.
- Everyone shown is ranked, including a player with two matches. A player
  under `PROVISIONAL_MATCHES` is flagged `provisional` so the UI can say the
  number is still settling — but they keep their rank.

Guest matches always feed the engine. A third of historical matches involve
a guest, so excluding them would discard a large part of the evidence. This is a
presentation filter and must never change what `compute()` is fed.

## Derived views

**Form** is the last five match verdicts for a player: W, L or D by games.

**Season standing** ranks players by rating gained within a season's date
range. The all-time rating never resets.

A season standing covers only players who **played at least one match that
season**. This is not the activity filter the section above forbids: that
rule governs the all-time ladder, where a member who missed a season still
belongs. A season board is about that season, and a member who did not play
has no performance in it — listing them on 0.0 would rank them above
everyone who turned up and lost.

**The default ladder view is all-time**, not the current season. At the
start of a season the season board is empty, and the all-time rating is the
number that always means something.

**Active** is a display flag only: the player has appeared in a match in the
current season. It marks a row; it never filters one out.
