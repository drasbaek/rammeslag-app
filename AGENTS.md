# AGENTS.md

The ELO ladder for Rammeslag FC, a ten-man padel team. Phone-first PWA.
Read `docs/ARCHITECTURE.md` for the layout and contract, `docs/RATING.md`
for the rating rules, `docs/DECISIONS.md` for why.

This file is the single source of truth for agents. `CLAUDE.md` points here.

## Hard rules

1. **Never touch the production database.** Schema changes ship as Alembic
   migrations. Production data moves only through `scripts/import_history.py`,
   run locally by a human. No agent runs it.

2. **Never commit real player data.** `export/` is gitignored and stays on
   one laptop. The committed `fixtures/` are pseudonymised. If you find real
   names in a diff, stop.

3. **Rating changes require fixture regeneration in the same commit.**
   The constants live in `backend/src/rammeslag/modules/rating/constants.py`.
   If `fixtures/expected_ratings.json` changes, say so explicitly in the PR
   body and explain who moved and why. A silent diff there is the single
   most damaging change possible in this repo — it rewrites the team's
   history.

4. **Winning always gains rating.** Property, not preference. See
   `docs/RATING.md`.

5. **The frontend never reaches the database.** All data comes from
   `/api/*`. No direct Postgres access from the web app.

6. **No nullable foreign keys** where a type column would do. Ask why the
   old schema's nullable `season_id` needed a paragraph of explanation.
   There is exactly one nullable FK in the schema, `events.session_id`, and
   `docs/ARCHITECTURE.md` says why. Adding a second one needs the same
   argument, in writing.

7. **Nothing in `modules/events/` may write a match.** Availability, squads
   and planned line-ups never reach the rating engine. A league fixture has
   no score in this app at all. If a change makes `modules/events/` import
   `rating/` or construct a `Match`, it is the wrong change — see rule 3.

## Language

Code, identifiers, comments, tests, docs, commit messages: **English**.
Anything a player reads on screen: **Danish**, hardcoded. There is no i18n
layer and adding one is not an improvement.

## Design principles

The app is a dark sports broadcast: near-black, one electric accent,
oversized numerals, tight rows. It is competitive infrastructure for a group
chat, so it is allowed to be funny.

- **Mobile-first at 390×844.** Nothing overflows horizontally, ever. A
  layout that only works on a laptop is not done.
- **Last place gets the bundprop treatment.** The humour is a feature that
  was explicitly asked for. Keep it affectionate.
- **Never show `entry_rating` to anybody but an admin.** It is an admin's
  private judgement of how good a teammate is. `GET /api/players` returns it
  to everyone, so this is a rule about screens, not a rule the API enforces:
  the player screen is open to the whole team and the rating column on it is
  not. Do not put it in front of the player it describes.

- **Admin is two things and stays two things.** Picking a squad -- selection,
  the planned line-ups, and editing an answer once the squad is locked -- and
  reading an entry rating. Everything else a member does needs a login and
  nothing more, including deleting a match or an evening: the ladder is a
  replay, so a delete is recoverable by re-entering, and routing it through an
  admin left the ladder wrong until somebody else woke up. Two guards keep the
  boundary real rather than decorative: only an admin grants or removes the
  admin flag, and only an admin sets a PIN that is not their own.
- **Availability is never dressed up as selection.** Saying "klar" is a
  tilmelding. Being picked is an admin's decision, under its own heading,
  in different words. A screen that blurs the two is telling ten people
  they are playing when six of them are.
- **Every stat shows its sample size.** "3-1 with Klaus" — never an
  unqualified claim of chemistry from four matches. The app does not
  pretend to know more than it does.
- **Motion on rank change, haptics on submit.** This is most of the
  difference between "looks cool" and "is a table".

## Commands

```
uv run --directory backend pytest            Tests, including the golden fixture
uv run --directory backend alembic upgrade head
uv run --directory backend ruff check .
npm --prefix frontend run dev
npm --prefix frontend run build
npm --prefix frontend run lint
```

## Definition of done

- `pytest` green, including `test_rating_golden.py`
- lint and typecheck clean on both sides
- screenshots at 390×844 of every screen you touched, attached to the PR
- user-visible strings in Danish
- no change to `fixtures/expected_ratings.json` unless the PR explains it

## Skills

`add-feature-module` scaffolds a vertical slice. Use it rather than
hand-rolling a new module, so bødekasse comes out shaped like matches.
`regenerate-fixture` re-runs the golden snapshot and explains the diff.
`review-on-mobile` drives the browser at phone size over every screen.
