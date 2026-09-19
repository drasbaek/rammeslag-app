"""Season routes. HTTP only."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from rammeslag.deps import get_db
from rammeslag.modules.seasons import service
from rammeslag.modules.seasons.schemas import SeasonOut

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
