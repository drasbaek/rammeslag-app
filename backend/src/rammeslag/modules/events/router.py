"""Event routes. HTTP only.

Reads are public, the same as every other read in this app: checking whether
Sunday is on should cost nothing. Putting a date in the calendar, answering on
it -- for yourself or for anybody else -- and taking it down again all cost a
login and nothing more. Admin is the squad: picking it, planning the line-up,
and editing answers once it is picked.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session as DbSession

from rammeslag.deps import current_user, get_db, optional_user, require_admin
from rammeslag.modules.events import service
from rammeslag.modules.events.schemas import (
    EventCountsOut,
    EventCreate,
    EventDetailOut,
    EventMatchupOut,
    EventOut,
    EventResponseOut,
    EventUpdate,
    MatchupsIn,
    ResponseIn,
    SelectionIn,
)
from rammeslag.modules.matches.schemas import player_out
from rammeslag.modules.players.models import Player
from rammeslag.modules.seasons.schemas import SeasonRef

router = APIRouter(prefix="/api", tags=["events"])


def _event_out(view: service.EventView) -> EventOut:
    return EventOut(
        id=view.id,
        season=SeasonRef(id=view.season_id, name=view.season_name),
        type=view.type,
        held_on=view.held_on,
        start_time=view.start_time,
        venue=view.venue,
        opponent=view.opponent,
        capacity=view.capacity,
        status=view.status,
        note=view.note,
        session_id=view.session_id,
        counts=EventCountsOut(
            yes=view.counts.yes,
            no=view.counts.no,
            maybe=view.counts.maybe,
            unanswered=view.counts.unanswered,
        ),
        selected_count=view.selected_count,
        surplus=view.surplus,
        my_state=view.my_state,
    )


@router.get("/events", response_model=list[EventOut])
def list_events(
    scope: str = Query(default="upcoming", description="upcoming | past | all"),
    season: str | None = Query(default=None, description="Season id."),
    type: str | None = Query(default=None, description="match | training"),
    db: DbSession = Depends(get_db),
    viewer: Player | None = Depends(optional_user),
) -> list[EventOut]:
    events = service.list_events(db, scope=scope, season_id=season, type=type)
    views = service.build_views(db, events, viewer_id=viewer.id if viewer else None)
    return [_event_out(view) for view in views]


@router.get("/events/{event_id}", response_model=EventDetailOut)
def get_event(
    event_id: str,
    db: DbSession = Depends(get_db),
    viewer: Player | None = Depends(optional_user),
) -> EventDetailOut:
    detail = service.get_detail(db, event_id, viewer_id=viewer.id if viewer else None)
    base = _event_out(detail.event)
    return EventDetailOut(
        **base.model_dump(),
        responses=[
            EventResponseOut(
                player=player_out(r.player),
                state=r.state,
                added_by=r.added_by,
                updated_at=r.updated_at,
            )
            for r in detail.responses
        ],
        unanswered=[player_out(p) for p in detail.unanswered],
        selected=[player_out(p) for p in detail.selected],
        matchups=[
            EventMatchupOut(
                round=m.round,
                court=m.court,
                team_a=[player_out(p) for p in m.team_a],
                team_b=[player_out(p) for p in m.team_b],
            )
            for m in detail.matchups
        ],
    )


@router.post("/events", response_model=EventOut, status_code=201)
def create_event(
    payload: EventCreate,
    db: DbSession = Depends(get_db),
    player: Player = Depends(current_user),
) -> EventOut:
    event = service.create_event(
        db,
        type=payload.type,
        held_on=payload.held_on,
        start_time=payload.start_time,
        venue=payload.venue,
        opponent=payload.opponent,
        capacity=payload.capacity,
        note=payload.note,
        created_by=player.id,
    )
    return _event_out(service.build_views(db, [event], viewer_id=player.id)[0])


@router.patch("/events/{event_id}", response_model=EventOut)
def update_event(
    event_id: str,
    payload: EventUpdate,
    db: DbSession = Depends(get_db),
    player: Player = Depends(current_user),
) -> EventOut:
    event = service.update_event(
        db,
        event_id,
        held_on=payload.held_on,
        start_time=payload.start_time,
        venue=payload.venue,
        opponent=payload.opponent,
        capacity=payload.capacity,
        status=payload.status,
        note=payload.note,
    )
    return _event_out(service.build_views(db, [event], viewer_id=player.id)[0])


@router.delete("/events/{event_id}", status_code=204)
def delete_event(
    event_id: str,
    db: DbSession = Depends(get_db),
    player: Player = Depends(current_user),
) -> Response:
    service.delete_event(db, event_id)
    return Response(status_code=204)


# --------------------------------------------------------------------------
# Answers
# --------------------------------------------------------------------------


@router.put("/events/{event_id}/response", response_model=EventOut)
def set_my_response(
    event_id: str,
    payload: ResponseIn,
    db: DbSession = Depends(get_db),
    player: Player = Depends(current_user),
) -> EventOut:
    """Answer for yourself. Klar, ikke klar, ved ikke."""
    service.set_response(
        db, event_id, player.id, payload.state, added_by=player.id, by_admin=player.is_admin
    )
    event = service.get_event(db, event_id)
    return _event_out(service.build_views(db, [event], viewer_id=player.id)[0])


@router.put("/events/{event_id}/response/{player_id}", response_model=EventOut)
def set_response_for(
    event_id: str,
    player_id: str,
    payload: ResponseIn,
    db: DbSession = Depends(get_db),
    actor: Player = Depends(current_user),
) -> EventOut:
    """Answer on someone's behalf.

    Anyone logged in, for anyone: this is how a guest joins a training, and
    how a name that only ever replies in the group chat gets onto the list.
    ``added_by`` records who actually typed it.
    """
    service.set_response(
        db, event_id, player_id, payload.state, added_by=actor.id, by_admin=actor.is_admin
    )
    event = service.get_event(db, event_id)
    return _event_out(service.build_views(db, [event], viewer_id=actor.id)[0])


@router.delete("/events/{event_id}/response/{player_id}", response_model=EventOut)
def clear_response(
    event_id: str,
    player_id: str,
    db: DbSession = Depends(get_db),
    actor: Player = Depends(current_user),
) -> EventOut:
    """Back to no answer, and the way a guest is taken off the list again."""
    service.clear_response(db, event_id, player_id, by_admin=actor.is_admin)
    event = service.get_event(db, event_id)
    return _event_out(service.build_views(db, [event], viewer_id=actor.id)[0])


# --------------------------------------------------------------------------
# Squad and plan
# --------------------------------------------------------------------------


@router.put("/events/{event_id}/selection", response_model=EventDetailOut)
def set_selection(
    event_id: str,
    payload: SelectionIn,
    db: DbSession = Depends(get_db),
    admin: Player = Depends(require_admin),
) -> EventDetailOut:
    service.set_selection(db, event_id, payload.player_ids)
    return get_event(event_id, db=db, viewer=admin)


@router.put("/events/{event_id}/matchups", response_model=EventDetailOut)
def set_matchups(
    event_id: str,
    payload: MatchupsIn,
    db: DbSession = Depends(get_db),
    admin: Player = Depends(require_admin),
) -> EventDetailOut:
    """Set the kampe, which is also what opens the evening they go into.

    A plan, not a result: nothing written here reaches the rating engine, and
    the session that comes back on ``session_id`` is empty. Every score in it
    is still typed in one kamp at a time, on the entry screen.
    """
    service.set_matchups(
        db,
        event_id,
        [
            service.MatchupInput(
                round=m.round,
                court=m.court,
                team_a=(m.team_a[0], m.team_a[1]),
                team_b=(m.team_b[0], m.team_b[1]),
            )
            for m in payload.matchups
        ],
        created_by=admin.id,
    )
    return get_event(event_id, db=db, viewer=admin)
