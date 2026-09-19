# Rammeslag FC

An ELO ladder for a ten-man padel team, built phone-first. Ninety-eight
matches of real history, one electric accent colour, and a bundprop
treatment for whoever is last.

It is also, deliberately, an example of what an **agent-ready repository**
looks like: one where you can label an issue and get back a pull request you
can actually review. Most of what makes that work is not the agent. It is
the guardrails around it, and they are all in this repo in plain sight.

## What it does

- A ladder, ranked by rating, with movement and form.
- Sessions: a training, a casual game, a social evening, a tournament. A
  session with zero matches is still a session, because the bøder still
  happen.
- Per-player profiles: rating curve, partner records, and every stat
  labelled with the number of matches it came from.
- Ratings are **computed by replay**, never stored incrementally. Delete a
  match and the ladder is correct again by construction.

The rating rules are specified in [`docs/RATING.md`](docs/RATING.md), which
is normative: the code implements that document and nothing else.

## Stack

| | |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind, shadcn/ui, TanStack Query, Recharts |
| Backend | FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2, managed with `uv` |
| Database | Neon Postgres, one branch database per preview deployment |
| Hosting | Vercel - the Next.js client and the FastAPI app under `api/` in one project |
| Agents | Claude Code, via GitHub Actions and `.claude/skills/` |

One load-bearing rule holds the whole thing together: **FastAPI owns all
logic and all database access.** Nothing in the web app touches Postgres.
Everything goes through `/api/*`. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Run it locally

Prerequisites: Python 3.12, [uv](https://docs.astral.sh/uv/), Node 22, and a
Postgres connection string (a free Neon branch is easiest).

```bash
# backend
uv sync --directory backend --extra dev
echo 'DATABASE_URL=postgresql://...' > backend/.env     # a Neon branch
echo 'SESSION_SECRET=dev-only' >> backend/.env
uv run --directory backend alembic upgrade head
uv run --directory backend --with uvicorn uvicorn rammeslag.main:app --reload --port 8000

# frontend, in a second terminal
npm --prefix frontend install
npm --prefix frontend run dev              # http://localhost:3000
```

The frontend starts in **mock mode** and needs no backend at all. Point it
at a real API with `NEXT_PUBLIC_API_MODE=live` and, if FastAPI is on another
port, `NEXT_PUBLIC_API_BASE=http://localhost:8000`.

Tests and checks:

```bash
uv run --directory backend pytest          # includes the golden rating test
uv run --directory backend ruff check .
npm --prefix frontend run lint
npm --prefix frontend run build
```

You do not need real data to develop. `fixtures/history.json` is a
pseudonymised copy of the real history, and the golden rating test runs
against it in milliseconds with no database at all.

## How the agent loop works

```
issue  →  labelled `agent`  →  branch + PR  →  Vercel preview  →  reviewed on a phone  →  merged
```

1. **An issue is filed** using one of the forms in
   [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE). They ask for three
   things - *what*, *where*, and *how we know it is done* - because an agent
   that has to guess at acceptance criteria will guess wrong and you will
   review the guess.
2. **The owner labels it `agent`.** That fires
   [`.github/workflows/agent.yml`](.github/workflows/agent.yml), which runs
   Claude Code against the issue. This repository is public, so anyone can
   open an issue; the workflow refuses to run unless the labeller is the
   repository owner, removes the label, and says why. Nobody gets to spend
   someone else's API budget.
3. **The agent opens a PR**, never a push to `main`, never a merge. It reads
   `AGENTS.md` first, runs the tests itself, and fills in the definition-of-
   done checklist honestly - including leaving the screenshot box unchecked,
   because it cannot open a browser in CI.
4. **Vercel builds a preview** against a Neon branch database. Real-shaped
   data, disposable, never production.
5. **A human opens the preview on an actual phone**, or an agent runs the
   `review-on-mobile` skill against it.
6. **Merge.** Auto-merge is possible and deliberately switched off; the one
   line to change is marked in `agent.yml`. Anything touching rating must
   never auto-merge.

### The guardrails, which are the interesting part

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the obvious
things - pytest, ruff, lint, typecheck, build - and two jobs that exist
because of specific ways this project can be quietly ruined:

**`rating fixture guard`.** `fixtures/expected_ratings.json` is the golden
snapshot of every rating the team has ever had. If a pull request changes
it, the PR body must contain a `## Rating change` section naming who moved,
by how much, and why. No explanation, no merge. This is the most important
check in the repo: a passing test suite proves nothing here, because an
agent that changes the engine and the snapshot in the same commit makes them
agree by construction. A human has to read the numbers and recognise that
Klaus really did move up twelve points.

**`no real data`.** `export/` holds the real history with real names and is
gitignored, but a gitignore is a convention and `git add -f` beats it. This
job fails the build if any local-only path appears in a diff, if an added
line carries an email address or a phone number, or - when the optional
`REAL_NAME_REGEX` secret is set - if an added line matches the real player
names. It reports `file:line` and never the matched text, so the check
cannot itself leak the names into a public build log.

### Agent tooling

[`AGENTS.md`](AGENTS.md) is the single source of truth: hard rules, language
policy, design principles, definition of done. `CLAUDE.md` is one line
pointing at it.

Three skills live in `.claude/skills/`:

- **`add-feature-module`** scaffolds a complete vertical slice - router,
  service, models, schemas, migration, tests, frontend route. Its whole
  purpose is sameness: bødekasse comes out shaped like matches, so the fifth
  module costs what the second did.
- **`regenerate-fixture`** re-runs the golden snapshot and prints the
  movement in human terms - *Klaus +12, Bo -8* - then makes you explain
  it in the PR body.
- **`review-on-mobile`** drives a browser over all five screens at 390×844,
  screenshots each, and checks for horizontal overflow, English copy that
  slipped through, and stats shown without their sample size.

[`.mcp.json`](.mcp.json) declares two MCP servers, and the choice of which
two is the point:

- **Playwright (browser).** This is the critical one. Everything else an
  agent does here is verifiable from a terminal: tests pass or they do not,
  ruff is clean or it is not. Layout is not. An agent with no browser cannot
  see that a long name has pushed the rating numeral off the right edge of a
  390px screen - every check it is able to run comes back green, so it
  reports success, and the bug ships. It is not being dishonest; it is
  blind, and blind plus confident is exactly the failure mode. Giving it
  eyes converts "the build passed" into "I looked at it", which is the only
  claim worth anything for a phone-first app.
- **Vercel.** Deployment status and preview URLs, so the agent can find the
  build to look at and read the logs when it fails.

There is no Neon MCP server, on purpose: agents have no business holding a
database connection when every read they need is already an HTTP endpoint.
And there is no custom MCP server for this project, because the API contract
is already published as OpenAPI at `/api/openapi.json`. A bespoke server
would be a second description of the same shapes, free to drift from the
first.

## What a contributor may never do

Three rules, in order of how much damage breaking them does.

1. **Never touch the production database.** Schema changes ship as Alembic
   migrations. Production data moves only through
   `scripts/import_history.py`, run locally, by a human, on purpose. No
   agent runs it, ever.
2. **Never commit real player data.** `export/` stays on one laptop. The
   committed fixtures are pseudonymised. If you spot a real name in a diff,
   stop and say so - this repository is public and a commit is forever, even
   after a revert.
3. **Never change ratings silently.** If `fixtures/expected_ratings.json`
   moves, explain who moved and why, in the same pull request. This is not
   bureaucracy. Ten people have a running argument about who is best, and
   this app is the referee. A referee who changes the score without saying
   anything is worse than no referee at all.

Also: the frontend never reaches the database, code and comments are
English, anything a player reads on screen is Danish and hardcoded, and
nothing is done until it has been seen at 390×844.

## Deployment notes

The Vercel project's **Root Directory stays at the repository root**, not
the repo root. [`vercel.json`](vercel.json) does the rest: the web service is Next.js at the root and the api service is FastAPI
under `backend/`, deployed as a Python
function, with `/api/*` rewritten to the FastAPI entrypoint.

Secrets:

| Where | Name | Why |
|---|---|---|
| GitHub Actions | `ANTHROPIC_API_KEY` | the agent workflow |
| GitHub Actions | `REAL_NAME_REGEX` *(optional)* | the real-name scanner; unset means that half of the check is skipped, and CI says so |
| Vercel | `DATABASE_URL` | Neon, one branch per preview |
| Vercel | `SESSION_SECRET` | signed player session cookies |
