"""Match routes. HTTP only."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session as DbSession

from rammeslag.deps import current_user, get_db
from rammeslag.modules.matches import service
from rammeslag.modules.matches.schemas import MatchCreate, MatchOut, MatchScoreUpdate, match_out
from rammeslag.modules.players.models import Player

router = APIRouter(prefix="/api", tags=["matches"])


def _with_deltas(db: DbSession, match_id: str) -> MatchOut:
    """Replay so the response already carries this match's rating deltas. Every
    player's admin-set entry rating goes in; the engine seeds from those."""
    from rammeslag.modules.players.service import player_index

    rows = service.load_rows(db)
    view = service.replay_rows(rows, service.load_entry_ratings(db))
    row = next(r for r in rows if r.id == match_id)
    return match_out(service.build_match_views([row], player_index(db), view)[0])


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
        sets=[(s.games_a, s.games_b, s.tiebreak) for s in payload.sets],
        created_by=player.id,
    )
    return _with_deltas(db, match.id)


@router.patch("/matches/{match_id}", response_model=MatchOut)
def correct_score(
    match_id: str,
    payload: MatchScoreUpdate,
    db: DbSession = Depends(get_db),
    player: Player = Depends(current_user),
) -> MatchOut:
    # The whole history is replayed on the next read, so a corrected score
    # moves everything after it exactly as a correct entry would have.
    match = service.correct_score(
        db,
        match_id,
        sets=[(s.games_a, s.games_b, s.tiebreak) for s in payload.sets],
    )
    return _with_deltas(db, match.id)


@router.delete("/matches/{match_id}", status_code=204)
def delete_match(
    match_id: str,
    db: DbSession = Depends(get_db),
    player: Player = Depends(current_user),
) -> Response:
    # Deleting triggers a full replay. Never an inverse update.
    service.delete_match(db, match_id)
    return Response(status_code=204)
