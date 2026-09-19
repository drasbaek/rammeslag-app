# Decisions

Why the app is shaped the way it is. If you are an agent about to change
something here, the rejected options are listed for a reason — they were
considered and lost on specific grounds.

## 1. Vercel monorepo, not a container or a split deploy

Next.js and FastAPI in one Vercel project, Neon Postgres, a branch database
per preview. Chosen over a single Fly.io container and over a split
frontend/backend deploy because **per-PR preview environments with isolated
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

The humour does not survive translation — "Jonas has lost 4 in a row" is a
fact, "Jonas er ugens bundprop" is a joke, and only one of those was asked
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
