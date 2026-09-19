"""Session routes. HTTP only."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session as DbSession

from rammeslag.deps import current_user, get_db, require_admin
from rammeslag.modules.matches.schemas import match_out
from rammeslag.modules.players.models import Player
from rammeslag.modules.seasons import service as season_service
from rammeslag.modules.seasons.schemas import SeasonRef
from rammeslag.modules.sessions import service
from rammeslag.modules.sessions.schemas import (
    PlayerDeltaOut,
    RecapOut,
    SessionCreate,
    SessionDetailOut,
    SessionOut,
)

router = APIRouter(prefix="/api", tags=["sessions"])


def _delta_out(delta: service.PlayerDelta | None) -> PlayerDeltaOut | None:
    if delta is None:
        return None
    return PlayerDeltaOut(
        player_id=delta.player_id, name=delta.name, delta=delta.delta, rating=delta.rating
    )


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(
    season: str | None = Query(default=None, description="Season id."),
    db: DbSession = Depends(get_db),
) -> list[SessionOut]:
    seasons = {s.id: s for s in season_service.list_seasons(db)}
    return [
        SessionOut(
            id=play_session.id,
            season=SeasonRef(
                id=play_session.season_id,
                name=seasons[play_session.season_id].name
                if play_session.season_id in seasons
                else "",
            ),
            played_on=play_session.played_on,
            type=play_session.type,
            status=play_session.status,
            note=play_session.note,
            match_count=count,
        )
        for play_session, count in service.list_sessions(db, season)
    ]


@router.get("/sessions/{session_id}", response_model=SessionDetailOut)
def get_session(session_id: str, db: DbSession = Depends(get_db)) -> SessionDetailOut:
    detail = service.get_detail(db, session_id)
    return SessionDetailOut(
        id=detail.id,
        season=SeasonRef(id=detail.season_id, name=detail.season_name),
        played_on=detail.played_on,
        type=detail.type,
        status=detail.status,
        note=detail.note,
        matches=[match_out(m) for m in detail.matches],
        recap=RecapOut(
            biggest_riser=_delta_out(detail.recap.biggest_riser),
            biggest_faller=_delta_out(detail.recap.biggest_faller),
            bundprop=_delta_out(detail.recap.bundprop),
        ),
    )


@router.post("/sessions", response_model=SessionOut, status_code=201)
def create_session(
    payload: SessionCreate,
    db: DbSession = Depends(get_db),
    player: Player = Depends(current_user),
) -> SessionOut:
    play_session = service.create_session(
        db,
        played_on=payload.played_on,
        type=payload.type,
        note=payload.note,
        created_by=player.id,
    )
    season = season_service.get_season(db, play_session.season_id)
    return SessionOut(
        id=play_session.id,
        season=SeasonRef(id=season.id, name=season.name),
        played_on=play_session.played_on,
        type=play_session.type,
        status=play_session.status,
        note=play_session.note,
        match_count=0,
    )


@router.post("/sessions/{session_id}/close", response_model=SessionOut)
def close_session(
    session_id: str,
    db: DbSession = Depends(get_db),
    player: Player = Depends(current_user),
) -> SessionOut:
    play_session = service.close_session(db, session_id)
    season = season_service.get_season(db, play_session.season_id)
    counts = {s.id: c for s, c in service.list_sessions(db, play_session.season_id)}
    return SessionOut(
        id=play_session.id,
        season=SeasonRef(id=season.id, name=season.name),
        played_on=play_session.played_on,
        type=play_session.type,
        status=play_session.status,
        note=play_session.note,
        match_count=counts.get(play_session.id, 0),
    )


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(
    session_id: str,
    db: DbSession = Depends(get_db),
    admin: Player = Depends(require_admin),
) -> Response:
    # Deleting triggers a full replay. Never an inverse update.
    service.delete_session(db, session_id)
    return Response(status_code=204)
