# Architecture

One deployable: a Vercel project holding a Next.js client and a FastAPI
backend, backed by Neon Postgres.

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
api/
  index.py                 Vercel entrypoint. Mounts the FastAPI app.
backend/
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
      rating/
  migrations/              Alembic.
  tests/
app/                       Next.js App Router. Client components.
components/                shadcn/ui plus ours.
lib/api.ts                 Typed client generated from OpenAPI.
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

`session_id` is **NOT NULL**. A one-off game creates a `casual` session; a
bøde with no padel is a `social` session with zero matches. Variation lives
in `session.type`. The old schema used a nullable `season_id` and every
reader had to learn the convention — we are not doing that again.

Game totals are derived by summing `match_sets`, never stored.

## API contract

All routes are under `/api`. Reads are public. Writes need a player session
cookie. Deletes need admin.

```
GET    /api/health

GET    /api/ladder?season=<id|all>     Ranked players. Rating, movement, form.
GET    /api/players
GET    /api/players/{id}               Profile, rating curve, stats.
GET    /api/seasons
GET    /api/sessions?season=<id>
GET    /api/sessions/{id}              Detail, matches, recap highlights.

POST   /api/auth/login                 {player_id, pin} -> cookie
POST   /api/auth/logout
GET    /api/auth/me

POST   /api/sessions                   auth
POST   /api/sessions/{id}/close        auth
POST   /api/matches                    auth
DELETE /api/sessions/{id}              admin
DELETE /api/matches/{id}               admin
```

The OpenAPI schema FastAPI emits at `/api/openapi.json` is the contract.
`lib/api.ts` is generated from it. There is no second description
of these shapes anywhere, and no custom MCP server restating them.

## Conventions

Code, comments, tests, identifiers and docs: **English**.
User-visible strings: **Danish**, hardcoded, no i18n layer.

Python: uv, SQLAlchemy 2.0, Alembic, Pydantic v2, pytest.
TypeScript: Next.js App Router, Tailwind, shadcn/ui, Recharts, TanStack Query.
