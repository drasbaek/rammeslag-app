# Architecture

One deployable: a Vercel project holding two **services** -- a Next.js
client at the repo root and a FastAPI backend under `backend/` -- backed by
Neon Postgres.

They build independently and ship together, so the frontend and the API can
never be out of step with each other. A top-level rewrite sends `/api/*` to
the backend service and everything else to the web service. This is the
mechanism for a polyglot app in one Vercel project; a single-framework
project cannot host a Python backend, because the framework owns the build
and a root `api/` directory is never picked up.

**The load-bearing rule: FastAPI owns all logic and all database access.**
The frontend is a pure client that speaks HTTP. Nothing in the web app
ever touches Postgres. If you are tempted, you are about to rebuild the old app.

## Layout

```
AGENTS.md                  Agent entrypoint. Single source of truth.
CLAUDE.md                  Pointer to AGENTS.md. Keep it one line.
docs/
  ARCHITECTURE.md          This file.
  RATING.md                The ELO specification.
  DECISIONS.md             Why things are the way they are.
backend/
  app.py                   Vercel service entrypoint. Exports the ASGI app.
  requirements.txt         Runtime deps for Vercel. pyproject stays the
                           source of truth; this mirrors it.
  pyproject.toml           uv-managed.
  src/rammeslag/
    main.py                App factory, router registration.
    config.py              Settings from env.
    db.py                  Engine and session lifecycle.
    deps.py                current_user() and require_admin().
    modules/               Vertical feature slices. See below.
      players/
      seasons/
      sessions/
      matches/
      events/
      rating/
  migrations/              Alembic.
  tests/
app/                       Next.js App Router. Client components.
components/                shadcn/ui plus ours.
lib/api.ts                 Typed client generated from OpenAPI.
lib/attendance.ts          Who is at the hall tonight, per session, in
                           localStorage. Deliberately not an API
                           resource: a session is its matches, and this
                           only has to survive a reload. An event's
                           yes-list pre-fills it; it is still local.
public/                    Manifest and icons.
package.json               The Next.js app lives at the repo root, because
                           Vercel detects the framework from a root
                           package.json. A frontend/ subdirectory looks
                           tidier and costs a broken deploy.
fixtures/
  history.json             Pseudonymised real history.
  expected_ratings.json    Golden snapshot. CI asserts against this.
scripts/
  pseudonymize.py          Local only. export/ -> fixtures/.
  import_history.py        Local only. export/ -> production.
.github/workflows/
.claude/skills/
```

## The module pattern

Every feature is a vertical slice under `backend/src/rammeslag/modules/<name>/`:

```
router.py      FastAPI routes. HTTP only: parse, authorise, delegate, serialise.
service.py     Business logic. No FastAPI imports. No request objects.
models.py      SQLAlchemy ORM models.
schemas.py     Pydantic request and response models.
```

A module may import from `core/` and from another module's `service.py`.
A module may never import another module's `router.py`.

This is what "holds the promise for expansion" means in practice: bødekasse
is a new folder with four files, not a new set of conventions. The
`add-feature-module` skill scaffolds it.

## The rating engine is pure

`modules/rating/engine.py` takes a sequence of match inputs and returns
ratings plus per-player history. It does no I/O, touches no database, and
imports nothing from FastAPI or SQLAlchemy.

```python
def compute(matches: Sequence[MatchInput]) -> RatingResult: ...
```

Two reasons this matters. The golden test runs in milliseconds against
`fixtures/history.json` with no database. And the constraint "an agent may
not change rating behaviour without regenerating the fixture" is mechanically
enforceable, because all rating behaviour lives behind one pure function.

Ratings are **computed by replay, never stored incrementally**. Deleting a
match is therefore correct by construction, and K is re-tunable forever.
At 98 matches a full replay is single-digit milliseconds. Revisit caching
above roughly 5,000 matches, not before.

Only matches with `source = 'internal'` reach the engine. RankedIN data,
when it arrives, is display-only.

## Events are not sessions

A **session** is retrospective: an evening defined by the matches played on
it. An **event** is prospective: a date people answer before it exists.
They are separate tables and separate modules.

Folding a planned Sunday into `sessions` would put empty future rows into the
history list and into every reader that walks sessions, none of which asked
for a calendar. `sessions` stays the record of what happened.

Two kinds live in one table, discriminated by `type`, the same way
`session.type` works:

- `match` — a league fixture against another club. Availability and the squad
  an admin picks. **No score is ever recorded.** These are not internal
  doubles and nothing about them reaches the ladder.
- `training` — a Sunday. Availability, a court count, the kampe an admin sets,
  and a link to the `session` those kampe are played into.

Three rules hold this together, and an agent changing this module must keep
all three:

1. **Availability is never selection.** `event_responses` and
   `event_selections` are separate tables and nothing derives one from the
   other. Saying "klar" is a tilmelding; being picked is an admin's decision.
   Every screen that shows them puts them under different headings.
2. **`event_matchups` is a whiteboard.** Planned line-ups have no score and
   never become `Match` rows by themselves. Score entry writes matches, from
   the same screen every other result goes through. Nothing in `modules/events/`
   imports the rating engine, writes a `Match`, or can move
   `fixtures/expected_ratings.json`.
3. **`events.session_id` is the one nullable FK in the schema**, and it is
   deliberate. Rule 6 in AGENTS.md forbids a nullable FK *where a type column
   would do* — here one would not. A training has a session only after its
   kampe are set, so this is optional state over time, not a discriminator.

## Setting the kampe is what opens an evening

`PUT /api/events/{id}/matchups`, on a training with a non-empty plan, creates
the empty `session` those kampe will be played into and links the two. It is
the only way a session is created from the app.

This is one decision, so it is one action. It used to be two — a plan, then a
separate "open the evening" button — next to a third way in, a "ny
træningssession" that created a session with no training in front of it at
all. Three doors onto the same Sunday is how a date ends up in the app twice,
once in the calendar the team answers and once in the history list, with the
scores on the wrong one.

The session is still **empty**. The plan is read back beside it, not copied
into it:

- `GET /api/sessions/{id}` returns `planned[]` — each planned court with its
  four players and the `match_id` of the result typed in for it, or `null`.
- The pairing is computed on read, as a pure function over player ids, by
  matching the two unordered pairs. Nothing links a planned court to a match
  in the schema, and nothing writes one.
- Sides may be swapped by whoever typed the score in; a plan may repeat the
  same four people in a later round, so each match answers at most one
  planned court, in round order.
- A kamp nobody planned is an ordinary kamp. It counts for the ladder and is
  simply not in `planned[]`.

**Closing is gated on the plan.** `POST /api/sessions/{id}/close` is refused
while any planned kamp is without a score, because closing is what turns an
evening into the morning-after report and the recap is sums over kampe that
have not all been played yet. Scores arriving one at a time from four
different phones is the point; the evening stays open until the last one is
in. An evening with no plan behind it — everything the old spreadsheet left
— closes whenever somebody says so.

## Schema

```
players(id, name, is_guest, is_admin, pin_hash, created_at)

seasons(id, name, starts_on, ends_on)

sessions(id, season_id FK, played_on, type, status, note,
         created_by FK, created_at)
         type   : training | casual | social | tournament
         status : open | closed

matches(id, session_id FK NOT NULL, played_at, source,
        team_a_player1_id, team_a_player2_id,
        team_b_player1_id, team_b_player2_id,
        created_by FK, created_at)
        source : internal | rankedin

match_sets(id, match_id FK, set_number, games_a, games_b)
```

```
events(id, season_id FK, type, held_on, start_time, venue, opponent,
       capacity, status, note, session_id FK NULL, created_by, created_at)
       type     : match | training
       status   : open | locked | cancelled
       capacity : player slots. A fixture's squad (6), or courts x 4 (12).

event_responses(id, event_id FK, player_id FK, state, added_by, updated_at)
       state    : yes | no | maybe
       UNIQUE(event_id, player_id). No row means "has not answered".

event_selections(id, event_id FK, player_id FK, created_at)
event_matchups(id, event_id FK, round, court, 4 x player_id)
```

`session_id` is **NOT NULL**. A one-off game creates a `casual` session; a
bøde with no padel is a `social` session with zero matches. Variation lives
in `session.type`. The old schema used a nullable `season_id` and every
reader had to learn the convention — we are not doing that again.

Game totals are derived by summing `match_sets`, never stored.

## API contract

All routes are under `/api`. Reads are public. Writes need a player session
cookie. Admin is the squad -- selection, the plan, and an answer under a
locked team sheet -- plus the two guards that keep the flag from being
decoration: granting admin, and setting somebody else's PIN.

```
GET    /api/health

GET    /api/ladder?season=<id|all>     Ranked players. Rating, movement, form.
GET    /api/players
GET    /api/players/{id}               Profile, rating curve, stats.
GET    /api/seasons
GET    /api/sessions?season=<id>       Each row carries event_id and planned_count.
GET    /api/sessions/{id}              Detail, matches, the plan, recap highlights.

POST   /api/auth/login                 {player_id, pin} -> cookie
POST   /api/auth/logout
GET    /api/auth/me

POST   /api/sessions                   auth   Not reachable from the app: an
                                              evening comes from a training's
                                              plan. Kept for import scripts.
POST   /api/sessions/{id}/close        auth   Refused while a planned kamp has
                                              no score.
PATCH  /api/sessions/{id}              auth   Re-dating moves its matches.
POST   /api/matches                    auth
DELETE /api/sessions/{id}              auth   Replay, so re-enterable.
DELETE /api/matches/{id}               auth   Replay, so re-enterable.

GET    /api/events?scope=&season=&type=   upcoming | past | all
GET    /api/events/{id}                Detail: answers, squad, planned line-ups.
POST   /api/events                     auth
PATCH  /api/events/{id}                auth   Re-dating re-resolves the season.
DELETE /api/events/{id}                auth   Never touches a linked session.

PUT    /api/events/{id}/response              auth   Your own answer.
PUT    /api/events/{id}/response/{player}     auth   Anyone's. Locked: admin.
DELETE /api/events/{id}/response/{player}     auth   Back to no answer.

PUT    /api/events/{id}/selection      admin  The whole squad, at once.
PUT    /api/events/{id}/matchups       admin  The whole plan, at once. On a
                                              training, a non-empty plan also
                                              opens the session it is played
                                              into and links it.

POST   /api/players                    auth   is_admin: admin only.
PATCH  /api/players/{id}               auth   is_admin, and another's pin: admin.
POST   /api/players/guest              auth   Name only. Seed rating, no PIN.
GET    /api/seasons, POST, PATCH       auth   An evening needs a season to exist.
```

Selection and the plan are whole-list `PUT`s rather than per-row writes: an
admin picks a squad as one decision, and a stream of row edits would need an
ordering story it does not have.

Re-planning is ordinary — somebody drops out an hour before — and it never
opens a second evening: a training that already has a `session_id` keeps it,
with whatever scores are already in it. Saving an *empty* plan opens nothing;
that is a whiteboard being wiped.

The OpenAPI schema FastAPI emits at `/api/openapi.json` is the contract.
`lib/api.ts` is generated from it. There is no second description
of these shapes anywhere, and no custom MCP server restating them.

## Conventions

Code, comments, tests, identifiers and docs: **English**.
User-visible strings: **Danish**, hardcoded, no i18n layer.

Python: uv, SQLAlchemy 2.0, Alembic, Pydantic v2, pytest.
TypeScript: Next.js App Router, Tailwind, shadcn/ui, Recharts, TanStack Query.
