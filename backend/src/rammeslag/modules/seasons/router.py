"""Season routes. HTTP only."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from rammeslag.deps import get_db, require_admin
from rammeslag.modules.players.models import Player
from rammeslag.modules.seasons import service
from rammeslag.modules.seasons.models import Season
from rammeslag.modules.seasons.schemas import SeasonCreate, SeasonOut, SeasonUpdate

router = APIRouter(prefix="/api", tags=["seasons"])


@router.get("/seasons", response_model=list[SeasonOut])
def list_seasons(db: DbSession = Depends(get_db)) -> list[SeasonOut]:
    seasons = service.list_seasons(db)
    current = service.pick_current_season(seasons, datetime.now(UTC).date())
    current_id = current.id if current else None
    return [
        SeasonOut(
            id=s.id,
            name=s.name,
            starts_on=s.starts_on,
            ends_on=s.ends_on,
            is_current=s.id == current_id,
        )
        for s in seasons
    ]


def _as_out(db: DbSession, season: Season) -> SeasonOut:
    """One season, with is_current resolved against today the same way the
    list route does it."""
    current = service.pick_current_season(service.list_seasons(db), datetime.now(UTC).date())
    return SeasonOut(
        id=season.id,
        name=season.name,
        starts_on=season.starts_on,
        ends_on=season.ends_on,
        is_current=bool(current and current.id == season.id),
    )


@router.post("/seasons", response_model=SeasonOut, status_code=201)
def create_season(
    payload: SeasonCreate,
    db: DbSession = Depends(get_db),
    admin: Player = Depends(require_admin),
) -> SeasonOut:
    """Add a season. Admin only.

    Sessions cannot exist outside a season, so this is what unblocks recording
    a new one after the calendar moves past the last season's end date.
    """
    season = service.create_season(
        db, name=payload.name, starts_on=payload.starts_on, ends_on=payload.ends_on
    )
    return _as_out(db, season)


@router.patch("/seasons/{season_id}", response_model=SeasonOut)
def update_season(
    season_id: str,
    payload: SeasonUpdate,
    db: DbSession = Depends(get_db),
    admin: Player = Depends(require_admin),
) -> SeasonOut:
    """Rename a season or move its dates. Admin only.

    Narrowing the dates is refused if it would strand sessions already inside
    the season.
    """
    season = service.update_season(
        db,
        season_id,
        name=payload.name,
        starts_on=payload.starts_on,
        ends_on=payload.ends_on,
    )
    return _as_out(db, season)
