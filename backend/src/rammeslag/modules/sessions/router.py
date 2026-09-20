"""Session routes. HTTP only."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session as DbSession

from rammeslag.deps import current_user, get_db
from rammeslag.modules.matches.schemas import match_out, player_out
from rammeslag.modules.players.models import Player
from rammeslag.modules.seasons import service as season_service
from rammeslag.modules.seasons.schemas import SeasonRef
from rammeslag.modules.sessions import service
from rammeslag.modules.sessions.models import Session as PlaySession
from rammeslag.modules.sessions.schemas import (
    PlannedGameOut,
    PlayerDeltaOut,
    RecapOut,
    SessionCreate,
    SessionDetailOut,
    SessionOut,
    SessionUpdate,
)

router = APIRouter(prefix="/api", tags=["sessions"])


def _session_out(db: DbSession, play_session: PlaySession) -> SessionOut:
    """One saved session, with the match count the list screen sorts on."""
    season = season_service.get_season(db, play_session.season_id)
    counts = {s.id: c for s, c in service.list_sessions(db, play_session.season_id)}
    event_id, planned = service.plan_counts(db, [play_session.id]).get(
        play_session.id, (None, 0)
    )
    return SessionOut(
        id=play_session.id,
        season=SeasonRef(id=season.id, name=season.name),
        played_on=play_session.played_on,
        type=play_session.type,
        status=play_session.status,
        note=play_session.note,
        match_count=counts.get(play_session.id, 0),
        event_id=event_id,
        planned_count=planned,
    )


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
    rows = service.list_sessions(db, season)
    # One query for the whole list rather than one per row: the plan is what
    # says "tre af seks skrevet ind" on every evening that was a training.
    plans = service.plan_counts(db, [play_session.id for play_session, _ in rows])
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
            event_id=plans.get(play_session.id, (None, 0))[0],
            planned_count=plans.get(play_session.id, (None, 0))[1],
        )
        for play_session, count in rows
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
        event_id=detail.event_id,
        matches=[match_out(m) for m in detail.matches],
        planned=[
            PlannedGameOut(
                round=game.round,
                court=game.court,
                team_a=[player_out(p) for p in game.team_a],
                team_b=[player_out(p) for p in game.team_b],
                match_id=game.match_id,
            )
            for game in detail.planned
        ],
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
    """Close the evening, which is what turns it into the report.

    Refused while a planned kamp is still without a score: the recap is sums
    over the evening's kampe, and one taken before they have all been played
    is a wrong answer rather than an early one.
    """
    return _session_out(db, service.close_session(db, session_id))


@router.patch("/sessions/{session_id}", response_model=SessionOut)
def update_session(
    session_id: str,
    payload: SessionUpdate,
    db: DbSession = Depends(get_db),
    player: Player = Depends(current_user),
) -> SessionOut:
    """Edit an evening. Re-dating it moves its matches, so the ladder that is
    replayed on the next read already accounts for the move."""
    play_session = service.update_session(
        db,
        session_id,
        played_on=payload.played_on,
        type=payload.type,
        note=payload.note,
    )
    return _session_out(db, play_session)


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(
    session_id: str,
    db: DbSession = Depends(get_db),
    player: Player = Depends(current_user),
) -> Response:
    # Deleting triggers a full replay. Never an inverse update.
    service.delete_session(db, session_id)
    return Response(status_code=204)
