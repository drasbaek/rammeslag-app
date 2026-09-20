# Rating specification

This document is normative. `modules/rating/engine.py` implements exactly
this and nothing else. Changing any constant or rule here requires
regenerating `fixtures/expected_ratings.json` in the same commit.

## Inputs

Matches where `source = 'internal'`, replayed in chronological order by
`played_at`, ties broken by `match_id`.

Every player starts at their own **entry rating**, a required field set when
the player is added. It is **shown to admins and to nobody else**: it is a
private judgement of how strong a teammate is, and it stays between admins.
The API returns it to anyone who asks; the UI must not surface it to players.
Any member can add a player and say where they enter, because somebody has to
be able to on a Sunday afternoon — but the number is never read back onto a
screen they can see, and correcting one afterwards is an admin's. A newcomer
joining an established field is not a 1000-rated player, and a human is
better placed to judge that than any formula. `SEED_RATING` is the suggested default and the fallback for a
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

The engine reads the **per-set scores**. Game totals are derived from them
(`games_a` is the sum of every set's `score_a`), never carried alongside, so
the two cannot disagree.

## Per match

Team rating is the mean of its two players:

    R_a = (rating[a1] + rating[a2]) / 2
    R_b = (rating[b1] + rating[b2]) / 2

Expected score for team A, standard logistic on a 400-point scale:

    E_a = 1 / (1 + 10 ** ((R_b - R_a) / 400))
    E_b = 1 - E_a

Observed score comes from **sets won**, with games breaking a tie on sets.
A set is won on a two-game lead, or at 7-6; anything else counts for neither
side (see "The set rule" below):

    sets_a = the number of sets team A won
    sets_b = the number of sets team B won

    S_a = 1.0  if sets_a > sets_b
          0.0  if sets_a < sets_b
          otherwise, level on sets, so the game count decides:
          1.0  if games_a > games_b
          0.0  if games_a < games_b
          0.5  if games_a == games_b

    S_b = 1 - S_a

Sets decide because sets are what the players believe they won. 6-0 6-7 6-7
is a win for B by one set, however the 32 games fell, and an engine that
reads only the game totals credits it to A. That was a real bug, not a
tuning choice.

Games are not decoration, though: timed sets end level often enough that
sets alone leave 19 of the 98 historical matches undecided. Games resolve
12 of those; the remaining 7 are level on both and stay draws.

Margin multiplier, proportional because match length varies from 7 to 24
games. The margin belongs to **whoever won the match**, and it is clamped at
zero:

    total = games_a + games_b
    won   = the winner's game total,  lost = the loser's
    mov   = 1 + MOV_SCALE * max(0, won - lost) / total

The clamp is what stops the sets rule from paying a perverse bonus. A team
that takes the sets while trailing on games — 6-0 6-7 6-7 again, B winning
with 14 games to 18 — has a negative margin. Withholding the bonus leaves
that match moving by K alone (`mov = 1.0`); an unclamped `abs()` would have
handed B a 1.22x *reward* for being outplayed on games. For a draw both
totals are equal, so `mov` is 1.0 there too.

`MOV_SCALE` multiplies the margin term, as written above. Several placements
are numerically identical at 1.0; this one is normative, and the others
diverge the moment anyone tunes it — which is now the case, at 1.75.

If `total == 0` — no games played in any set — no rating changes, but the
match **does** count toward
`matches_played` and toward the provisional threshold — one counter, not two.
This is defensive only: the matches module rejects a match with no games at
write time, so it should never reach the engine from the app.

Each player has their own K, so newcomers converge without making veterans
volatile:

    K_i = 56.0  if that player has played fewer than 5 matches so far
          28.0  otherwise

"So far" means matches already applied during this replay, counted before
this match is applied.

Finally, for each player i on team T:

    rating[i] += K_i * mov * (S_T - E_T)

Because K is per player, a match is not strictly zero-sum while anyone is
provisional. That is intended.

## Properties that must hold

- **Winning always gains rating.** `S_T - E_T > 0` whenever team T wins,
  since `E_T < 1` always, and `mov >= 1.0` always, so the margin term can
  never scale a win down to nothing. Any change that breaks this is a bug,
  not a tuning decision.
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
| `K_STANDARD` | 28.0 |
| `K_PROVISIONAL` | 56.0 (held at twice `K_STANDARD`) |
| `PROVISIONAL_MATCHES` | 5 |
| `MOV_SCALE` | 1.75 |
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

## The set rule

A set is won when a team leads by two or more games, or at 7-6. Anything else
counts for neither side — these are timed sessions, so sets end unfinished at
4-3 or 5-4 routinely.

This rule **is normative and feeds the rating.** It lives in
`rating.engine.set_winner`, and `matches.service.set_verdict` is a
presentation of it rather than a second copy — two implementations is how
the ladder and the scorecard start disagreeing about who won.

Across the 98 historical matches: 78 have sets and games agreeing, 12 are
level on sets and resolved by games, 7 are level on both and are draws, and
**1 is level on games and resolved by sets** — 2026-02-01, a 6-7 2-1 that
games call 8-8. The game count alone made that a draw even though one side
won a set and lost none. No historical match has games and sets naming
opposite winners, but nothing prevents it: 6-0 6-7 6-7 is exactly that shape.

An earlier version of this document claimed the two verdicts "never
disagree" and that games "merely resolves 11 matches that sets leaves
level". Both were wrong: the count is 12, and the 2026-02-01 match disagrees
in the other direction.

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

**Form** is the last five match verdicts for a player: W, L or D by the same
sets-then-games rule the rating uses, so a player's form can never contradict
their rating curve.

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
