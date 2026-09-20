# Decisions

Why the app is shaped the way it is. If you are an agent about to change
something here, the rejected options are listed for a reason — they were
considered and lost on specific grounds.

## 1. Vercel monorepo, not a container or a split deploy

Next.js and FastAPI in one Vercel project, Neon Postgres, a branch database
per preview. Chosen over a single Fly.io container and over a split
split frontend/backend deploy because **per-PR preview environments with isolated
data** are the mechanism the whole agent loop depends on: an agent opens a
PR, a live URL appears, it gets reviewed from a phone.

Cost accepted: no long-running background work. Irrelevant now; a scheduled
worker can be added without moving the app.

## 2. Verdict from total games, not sets

`S ∈ {0, 0.5, 1}` decided by games won, with a proportional margin
multiplier scaling the update.

The data settled this: across all 98 historical matches the set verdict and
the games verdict **never disagree**, while games resolves 11 matches that
sets leaves as draws (19 draws down to 8). Sets are noisy because these are
timed sessions that end mid-set.

Rejected: continuous game share as `S`. It is more information-efficient,
but Elo's `E` is a win probability, so a strong pair winning 12-6 would
*lose* rating. Statistically defensible, socially fatal.

## 3. K=20, margin ×1, provisional K=40 for five matches

K does not measure anything — it chooses how far the ladder spreads. At K=12
the ladder barely moves and nobody opens the app; at K=32 with a doubled
margin the model claims the top regular beats the bottom one 98% of the
time, which is not true of ten men who play doubles together weekly.

K=20 gives roughly 10-point moves and a spread that passes the straight-face
test. Because ratings are replayed rather than accumulated, this is
re-tunable forever.

## 4. Open to read, PIN to write, admin to delete

Checking the ladder is a glance and should cost nothing; entering a result
is deliberate. Per-player PINs give real identity — needed for bødekasse and
practice games later — with no external dependency.

Rejected: Google OAuth. It needs exact redirect URIs, which Vercel's dynamic
preview URLs do not provide, so every agent-generated preview would break at
the login screen. Kept behind `current_user()` so it remains a one-file swap.

## 5. Pseudonymised history as a golden fixture

`export/` (28 real names) is gitignored. `fixtures/` carries the real match
structure with invented names, plus a checked-in expected-ratings snapshot.

The privacy benefit is secondary. The point is a **deterministic oracle**:
replaying the fixture must produce exactly these ratings. That is what stops
an agent from refactoring the engine and silently moving the team's real
ladder, and it is the precondition for ever trusting auto-merge.

Rejected: synthetic data. It would lose the edge cases that actually break
rating code — the 19 set-draws, the 7-game match, the 24-game marathon.

## 6. Sessions are first-class and mandatory

98 matches fall on only 16 dates, 13 of them with exactly six matches. The
unit of this sport is the evening, not the match.

Every match has a NOT NULL `session_id`. One-off games create a `casual`
session; a bøde with no padel is a `social` session with zero matches.
Variation lives in `session.type`.

Rejected: a nullable FK. The old schema's nullable `season_id` needed a
paragraph of explanation in its own README, and every reader had to learn
the convention. One shape of data, nothing to explain.

## 7. Five screens

Ladder, sessions, session detail, entry, profile. Three would be a
spreadsheet with a nice font. The rating curve is the main addition and
costs nothing, because replay produces every player's history as a
by-product.

Playful stats ship, but always with their sample size shown. A five-match
partnership is not evidence of chemistry, and an app that says so loses
credibility fast.

## 8. Dark sports broadcast

Near-black, one electric accent, oversized numerals. Chosen because the app
spreads by screenshot into a group chat, because dark UI gets to a premium
result from typography and one colour alone, and because four of five
screens are ranks, deltas and a curve — all of which read better on dark.

shadcn/ui specifically, because it copies component source into the repo
where an agent can read and edit it, rather than hiding it in node_modules.

## 9. English code, Danish UI, no i18n

The humour does not survive translation — "Bo has lost 4 in a row" is a
fact, "Bo er ugens bundprop" is a joke, and only one of those was asked
for. But the repo is a public example, so identifiers and docs stay English.

No i18n layer: one audience, one language, and a framework would cost every
agent an indirection between a string and where it renders.

## 10. Issue-triggered agents, human merge; repo public

Label an issue `agent`, get a PR and a preview, review it on a phone, merge
it. Full autonomy is a later per-label flip and must never apply to
`rating/`.

Going straight to auto-merge would mean the first thing learned about the
guardrails is whether they held. Public repo: it is the point of the
project, pseudonymisation removed the obstacle, and public repos get
unlimited Actions minutes. Triggers are owner-gated so strangers cannot
spend money.

## 11. No notifications, no push, no share sheet

People open the app when they remember. The group chat is already the
notification layer, and the session detail screen is designed to be
screenshotted into it.

Rejected: web push (most infrastructure, silently broken on iOS unless
installed), chat webhooks (impossible on Messenger or WhatsApp), and a
generated share image. Simplicity won on the owner's explicit call.

## 12. FastAPI owns all data access

The frontend is a pure client. Next.js renders client-side and never touches
Postgres.

Rejected: Next.js reading Postgres directly for speed. That is exactly how
the previous app became spaghetti — rating rules in Python, the queries
displaying them in TypeScript, the two drifting apart. The property worth
protecting is that all logic is Python and the boundary is a typed HTTP API.

## 13. Rating never resets; seasons are a second race

The ELO is permanent and is the real all-time number. Each season
additionally ranks players by rating *gained* within it, so there are two
races at once and a fresh one every autumn.

Rejected: hard reset (destroys what you know about who is good), and soft
regression to the mean (quietly rewrites everyone's number for reasons that
are hard to defend in a group chat). The main ladder filters to active
players rather than decaying absent ones.

## 14. Two off-the-shelf MCP servers, no custom one

Browser and Vercel. The browser one is close to mandatory: visual work is
where agents fail most confidently, and an agent that cannot see its own
390px layout will ship a broken one and report success.

No Neon MCP — agents have no business in a database when migrations are code.
No custom domain server — FastAPI's OpenAPI schema is already a machine-
readable contract, and restating it would mean maintaining it twice.

Repo-local skills are weighted above MCP entirely.

## 11. Events are a separate resource from sessions

A `session` is an evening that happened, defined by its matches. Planned
kampe and søndagstræninger are the opposite — a date people answer before it
exists — so they get their own table and their own module.

Rejected: a `planned` status on `sessions`. It is the smaller diff, and it
would put empty future rows into the history list and into every reader that
walks sessions. The ladder is safe either way, because ratings replay from
matches, but "sessions" would stop meaning "what happened" and every reader
would need a filter it did not ask for.

Rejected: two tables, one per feature. A fixture and a training differ in two
fields out of ten and are answered by the same person on the same screen.
Variation lives in `type`, the same as it does for sessions.

## 12. Availability is not selection, and the schema says so

`event_responses` and `event_selections` are separate tables, and no code
path derives either from the other. An admin can pick a player who never
answered, and ten people saying klar for a squad of six leaves four of them
not playing.

This is the one thing the feature had to get right. The old spreadsheet only
ever answered "who is available" and the team read it correctly because it
could not say anything else. An app that merged the two would be telling ten
people they are playing.

The same rule runs through the UI: availability and the squad are always
different headings, and the word "udtaget" appears nowhere near the toggle.

## 13. Planned line-ups never become matches

`event_matchups` stores who an admin has put on which court in which round,
before the training. It has no score, and nothing turns it into a `Match`.

Score entry is still the only thing in the app that writes a match, from the
same screen every other result goes through. That is what keeps the whole
events module unable to move `fixtures/expected_ratings.json` — a property
that is checked by a test, not just asserted here.

Rejected: materialising planned matchups as scoreless `Match` rows to be
filled in later. It would put rows with no sets in front of the rating
engine, which is the one input it is documented not to validate.

## 14. A guest is an ordinary player, added by whoever is bringing them

`POST /api/players/guest` needs a login but not an admin, takes a name and
nothing else, and enters the guest at `SEED_RATING` with no PIN.

`POST /api/players` stays admin-only and still requires `entry_rating`,
because decision 4's reasoning holds for a member joining an established
field. It does not hold for a guest: the person adding them is holding a
phone on a Sunday afternoon, and routing that through an admin means the
roster is wrong until somebody else wakes up. An admin can correct the rating
afterwards, or flip `is_guest` and make them a member for real.

A separate route rather than opening up the existing one, so that everything
the whole team can reach is a guest with no PIN and no admin flag.

Adding a name that already exists returns that player instead of failing. Two
people adding the same guest to the same Sunday is a collision of intent, and
a second row would quietly split that guest's record in two.

## 15. Five tabs, with bødekasse dark before it exists

Stigen · Program · + · Historik · Bødekasse. The last one is dimmed and
inert.

Kampe and træninger share the Program tab because they are two things to the
people organising them and exactly one thing to the person checking their
phone: a date to answer.

That still holds, with one thing added since: the Program list carries a
`Alle · Kampe · Træning` chip row under the Kommende / Tidligere toggle. It is
not a retraction. There is still one tab, one list and one answering flow —
the chips narrow a request (`GET /api/events?type=`) and nothing else. What
the paragraph above got slightly wrong is that it treated "one thing to
answer" and "one thing to look at" as the same claim. They are not. An admin
chasing six klar for Saturday is looking for kampe, and eight Sundays in
between them are noise; the player checking whether they said yes to anything
is looking at all of it. The alternative was a second tab, and that costs what
it always costs: the same question asked in two places, two counts of what you
owe, and a player who answers on one screen and is still chased from the
other. A chip row costs one line of height on a 390px screen, it is styled
lighter than the Segmented above it so it reads as a view and not a
destination, and it resets to Alle every time the screen opens — a filter that
survives the tab you left is a filter that hides next Saturday from you.

Bødekasse is in the layout early because adding a fifth column later would
re-space the other four and move every tab out from under the thumb that had
learned where it was.

`Træningshistorik` became `Historik`: at five columns a tab is about 75px,
which is eight characters at 9px. The screen it opens still says the long
name at the top.
