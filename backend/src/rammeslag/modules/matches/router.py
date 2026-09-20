"""Match routes. HTTP only."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session as DbSession

from rammeslag.deps import current_user, get_db
from rammeslag.modules.matches import service
from rammeslag.modules.matches.schemas import MatchCreate, MatchOut, match_out
from rammeslag.modules.players.models import Player

router = APIRouter(prefix="/api", tags=["matches"])


@router.post("/matches", response_model=MatchOut, status_code=201)
def create_match(
    payload: MatchCreate,
    db: DbSession = Depends(get_db),
    player: Player = Depends(current_user),
) -> MatchOut:
    match = service.create_match(
        db,
        session_id=payload.session_id,
        team_a=payload.team_a,
        team_b=payload.team_b,
        sets=[(s.games_a, s.games_b) for s in payload.sets],
        created_by=player.id,
    )
    # Replay so the response already carries this match's rating deltas. Every
    # player's admin-set entry rating goes in; the engine seeds from those.
    rows = service.load_rows(db)
    view = service.replay_rows(rows, service.load_entry_ratings(db))
    from rammeslag.modules.players.service import player_index

    row = next(r for r in rows if r.id == match.id)
    return match_out(service.build_match_views([row], player_index(db), view)[0])


@router.delete("/matches/{match_id}", status_code=204)
def delete_match(
    match_id: str,
    db: DbSession = Depends(get_db),
    player: Player = Depends(current_user),
) -> Response:
    # Deleting triggers a full replay. Never an inverse update.
    service.delete_match(db, match_id)
    return Response(status_code=204)
