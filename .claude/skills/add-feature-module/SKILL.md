---
name: add-feature-module
description: Scaffold a complete vertical feature slice for the Rammeslag backend and frontend - router, service, models, schemas, Alembic migration, tests and a Next.js route. Use whenever a new feature needs its own backend module (bødekasse, tournaments, achievements) instead of hand-rolling one, so every slice comes out shaped like matches.
---

# add-feature-module

The point of this skill is sameness. `bødekasse` must come out looking like
`matches`, so the fifth module costs what the second did. Hand-roll one and
you will invent a second convention, and the next agent has to learn both.

Read `docs/ARCHITECTURE.md` first - this skill is its executable form - and
then open `backend/src/rammeslag/modules/matches/` and read all four files.
**That module is the reference implementation. The templates below are a
starting point; where they disagree with `matches/`, `matches/` wins.**

## Before you scaffold

Answer these out loud, in the PR description:

1. **Name.** Plural, lowercase, English: `fines`, not `bødekasse` and not
   `fine`. Danish is for the screen, English for the code.
2. **Does it own a table?** If not, it is not a module - it is a function on
   an existing service. A new folder is the expensive option.
3. **Whose service does it read?** A module may import another module's
   `service.py`. It may never import another module's `router.py`. If you
   need a router's behaviour, the logic is in the wrong file.
4. **Does it touch rating?** If any number this module produces reaches
   `modules/rating/engine.py`, stop and read hard rule 3 in AGENTS.md
   before writing a line.

## What gets created

```
backend/src/rammeslag/modules/<name>/__init__.py
backend/src/rammeslag/modules/<name>/models.py      SQLAlchemy ORM
backend/src/rammeslag/modules/<name>/schemas.py     Pydantic v2 wire shapes
backend/src/rammeslag/modules/<name>/service.py     logic, no FastAPI imports
backend/src/rammeslag/modules/<name>/router.py      HTTP only
backend/migrations/versions/<rev>_add_<name>.py     Alembic
backend/tests/test_<name>.py                        service first, HTTP second
frontend/lib/types.ts                               wire types (edit)
frontend/lib/api.ts                                 fetchers (edit)
frontend/lib/queries.ts                             TanStack hooks (edit)
frontend/app/<route>/page.tsx                       the screen
```

plus one line in `backend/src/rammeslag/main.py` to register the router.

## House conventions you must not re-invent

- **Ids are prefixed strings**, not integers: `String(64)` primary keys
  defaulted with `new_id(ID_PREFIX)` from `rammeslag.db`. Foreign keys are
  `String(64)` to match.
- **Timestamps are `UtcDateTime`** from `rammeslag.db`, defaulted with
  `utcnow`. Not `DateTime`, not `func.now()`.
- **Every router carries `prefix="/api"`** and declares its own path, and
  `main.py` includes it with no extra prefix.
- **The session dependency is `get_db`**, and the type is
  `from sqlalchemy.orm import Session as DbSession`.
- **Money is integer øre.** Never a float of kroner.
- **Danish is for strings a player reads**, including error messages that
  reach the UI - see the constants at the top of `deps.py`.

## Templates

Worked through with `fines` (bødekasse). Substitute `<name>`, `<Name>` and
`<route>` throughout.

### models.py

```python
"""Fine ORM model. One row per bøde, always attached to a session."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from rammeslag.db import Base, UtcDateTime, new_id, utcnow

ID_PREFIX = "fine"


class Fine(Base):
    __tablename__ = "fines"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: new_id(ID_PREFIX)
    )
    # NOT NULL, always. A type column beats a nullable foreign key - hard
    # rule 6. If you are about to write nullable=True on an FK, ask what the
    # null would mean and add a `type` column instead. A bøde with no padel
    # is a `social` session with zero matches, not a fine with no session.
    session_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    player_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("players.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    reason: Mapped[str] = mapped_column(String(80), nullable=False)
    # Integer øre. Never a float of kroner.
    amount_ore: Mapped[int] = mapped_column(Integer, nullable=False)
    created_by: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, nullable=False, default=utcnow)

    player = relationship("Player", foreign_keys=[player_id], lazy="joined")

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Fine {self.id} {self.player_id} {self.amount_ore}>"
```

### schemas.py

```python
"""Fine wire shapes."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FineCreate(BaseModel):
    session_id: str
    player_id: str
    reason: str = Field(min_length=1, max_length=80)
    amount_ore: int = Field(gt=0, le=100_000)


class FineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    session_id: str
    player_id: str
    player_name: str
    reason: str
    amount_ore: int
    created_at: datetime


class FineTotal(BaseModel):
    """A total never travels without the count it was computed from."""

    player_id: str
    player_name: str
    total_ore: int
    fine_count: int
```

`FineTotal` carries `fine_count` because of the sample-size rule in
AGENTS.md. Any aggregate a module returns ships the `n` behind it, or the
frontend cannot honour that rule even when it wants to.

### service.py

```python
"""Fine logic. No FastAPI imports, no request objects, no HTTP status codes."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from rammeslag.modules.fines.models import Fine
from rammeslag.modules.players.models import Player
from rammeslag.modules.sessions.models import Session as PadelSession


class FineError(Exception):
    """Domain failure. The router turns this into an HTTP status.

    The message is Danish: it reaches the player.
    """


def create_fine(
    db: DbSession,
    *,
    session_id: str,
    player_id: str,
    reason: str,
    amount_ore: int,
    created_by: str | None,
) -> Fine:
    if db.get(PadelSession, session_id) is None:
        raise FineError("Den session findes ikke.")
    if db.get(Player, player_id) is None:
        raise FineError("Den spiller findes ikke.")

    fine = Fine(
        session_id=session_id,
        player_id=player_id,
        reason=reason.strip(),
        amount_ore=amount_ore,
        created_by=created_by,
    )
    db.add(fine)
    db.flush()
    return fine


def list_for_session(db: DbSession, session_id: str) -> list[Fine]:
    return list(
        db.scalars(select(Fine).where(Fine.session_id == session_id).order_by(Fine.created_at))
    )


def totals(db: DbSession) -> list[tuple[Player, int, int]]:
    """(player, total_ore, fine_count), heaviest first."""
    rows = db.execute(
        select(Player, func.sum(Fine.amount_ore), func.count(Fine.id))
        .join(Fine, Fine.player_id == Player.id)
        .group_by(Player.id)
        .order_by(func.sum(Fine.amount_ore).desc())
    ).all()
    return [(player, int(total), int(count)) for player, total, count in rows]
```

### router.py

```python
"""Fine routes. HTTP only: parse, authorise, delegate, serialise."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DbSession

from rammeslag.deps import current_user, get_db
from rammeslag.modules.fines import service
from rammeslag.modules.fines.schemas import FineCreate, FineOut, FineTotal
from rammeslag.modules.players.models import Player

router = APIRouter(prefix="/api", tags=["fines"])


@router.get("/fines", response_model=list[FineTotal])
def get_totals(db: DbSession = Depends(get_db)) -> list[FineTotal]:
    return [
        FineTotal(
            player_id=player.id,
            player_name=player.name,
            total_ore=total,
            fine_count=count,
        )
        for player, total, count in service.totals(db)
    ]


@router.post("/fines", response_model=FineOut, status_code=status.HTTP_201_CREATED)
def post_fine(
    payload: FineCreate,
    db: DbSession = Depends(get_db),
    player: Player = Depends(current_user),
) -> FineOut:
    try:
        fine = service.create_fine(
            db,
            session_id=payload.session_id,
            player_id=payload.player_id,
            reason=payload.reason,
            amount_ore=payload.amount_ore,
            created_by=player.id,
        )
    except service.FineError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    db.commit()
    db.refresh(fine)
    return FineOut(
        id=fine.id,
        session_id=fine.session_id,
        player_id=fine.player_id,
        player_name=fine.player.name,
        reason=fine.reason,
        amount_ore=fine.amount_ore,
        created_at=fine.created_at,
    )
```

Register it in `main.py`, in `create_app`, next to the others:

```python
from rammeslag.modules.fines.router import router as fines_router
...
app.include_router(fines_router)
```

### The migration

```bash
uv run --directory backend alembic revision --autogenerate -m "add fines"
uv run --directory backend alembic upgrade head
```

Then **read the generated file before committing it**. Autogenerate is a
draft, not an answer. Three things, every time:

- foreign keys are `String(64)`, `nullable=False` where you meant it, with
  the `ondelete` you chose,
- no table you did not touch appears in the diff - a stale local database
  produces phantom drops, and a dropped column is lost history,
- `downgrade()` is real, not `pass`.

### tests/test_fines.py

```python
"""Service level first - that is where the logic is. HTTP second."""

from __future__ import annotations

import pytest

from rammeslag.modules.fines import service


def test_total_carries_its_count(db, make_player, make_session):
    player = make_player(name="Klaus")
    padel = make_session()
    service.create_fine(
        db, session_id=padel.id, player_id=player.id,
        reason="For sent", amount_ore=2000, created_by=player.id,
    )
    service.create_fine(
        db, session_id=padel.id, player_id=player.id,
        reason="Glemt bolde", amount_ore=1000, created_by=player.id,
    )

    found_player, total, count = service.totals(db)[0]
    assert found_player.id == player.id
    assert total == 3000
    assert count == 2  # the sample size travels with the number


def test_fine_needs_a_real_session(db, make_player):
    player = make_player()
    with pytest.raises(service.FineError):
        service.create_fine(
            db, session_id="session_nope", player_id=player.id,
            reason="Ingen session", amount_ore=100, created_by=player.id,
        )
```

Use the fixtures already in `backend/tests/conftest.py` - check their real
names before you write the test. If the factory you need is missing, add it
to `conftest.py` rather than building one inside your test file; the next
module needs it too.

### Frontend

Four edits, in this order. `lib/api.ts` is the only file that knows where
data comes from - keep it that way.

**`lib/types.ts`** - mirror the Pydantic shapes, snake_case, as they come
off the wire:

```ts
export interface FineTotal {
  player_id: PlayerId;
  total_ore: number;
  /** Sample size. A total without its count starts an argument. */
  fine_count: number;
  player_name: string;
}
```

**`lib/api.ts`** - one fetcher, following the existing `fetch*` pattern in
that file (including its mock branch, until the backend is live):

```ts
export async function fetchFineTotals(): Promise<FineTotal[]> {
  if (API_MODE === "mock") return mock.fineTotals();
  return http<FineTotal[]>("/api/fines");
}
```

**`lib/queries.ts`** - the key and the hook:

```ts
export const keys = {
  // ...existing keys
  fines: () => ["fines"] as const,
};

export function useFineTotals(): UseQueryResult<FineTotal[]> {
  return useQuery({ queryKey: keys.fines(), queryFn: api.fetchFineTotals });
}
```

**`frontend/app/<route>/page.tsx`**:

```tsx
"use client";

import { useFineTotals } from "@/lib/queries";
import { RowSkeletons } from "@/components/ui/skeleton";

export default function BoedekassePage() {
  const fines = useFineTotals();

  return (
    <main className="min-h-dvh bg-zinc-950 px-4 pb-24 pt-6 text-zinc-100">
      <h1 className="text-sm uppercase tracking-widest text-zinc-500">Bødekassen</h1>

      {fines.isPending && <RowSkeletons />}

      <ul className="mt-4 divide-y divide-zinc-900">
        {fines.data?.map((row) => (
          <li key={row.player_id} className="flex items-baseline gap-3 py-3">
            {/* min-w-0 + truncate: the long name yields, not the layout.
                This single pair is most of what keeps 390px honest. */}
            <span className="min-w-0 flex-1 truncate text-lg">{row.player_name}</span>
            <span className="tabular-nums text-3xl font-semibold">
              {Math.round(row.total_ore / 100)}
            </span>
            <span className="shrink-0 text-xs text-zinc-500">
              kr · {row.fine_count} bøder
            </span>
          </li>
        ))}
      </ul>

      {fines.data?.length === 0 && (
        <p className="mt-10 text-center text-zinc-500">Kassen er tom. Mistænkeligt.</p>
      )}
    </main>
  );
}
```

Danish on screen, English in code. `{row.fine_count} bøder` is the
sample-size rule again: a total with no count invites an argument nobody can
settle.

## Before you call it done

```bash
uv run --directory backend ruff check .
uv run --directory backend pytest
uv run --directory backend alembic upgrade head
npm --prefix frontend run lint
npm --prefix frontend exec -- tsc --noEmit
npm --prefix frontend run build
```

Then run the `review-on-mobile` skill against the new route. A module whose
screen has never been seen at 390×844 is not finished, it is merely typed.
