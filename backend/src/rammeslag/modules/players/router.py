"""Player, ladder and auth routes. HTTP only: parse, authorise, delegate, serialise."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session as DbSession

from rammeslag.deps import (
    clear_session_cookie,
    current_user,
    get_db,
    set_session_cookie,
)
from rammeslag.modules.players import service
from rammeslag.modules.players.models import Player
from rammeslag.modules.players.schemas import (
    CurvePoint,
    GuestCreate,
    HighlightsOut,
    LadderEntryOut,
    LadderOut,
    LoginRequest,
    MeOut,
    PairStatOut,
    PlayerCreate,
    PlayerOut,
    PlayerUpdate,
    ProfileOut,
    SeasonStatOut,
)
from rammeslag.modules.seasons.schemas import SeasonRef

router = APIRouter(prefix="/api", tags=["players"])
auth_router = APIRouter(prefix="/api/auth", tags=["auth"])


def _pair(stat: service.PairStat | None) -> PairStatOut | None:
    if stat is None:
        return None
    return PairStatOut(
        player_id=stat.player_id,
        name=stat.name,
        matches=stat.matches,
        wins=stat.wins,
        losses=stat.losses,
        draws=stat.draws,
        win_rate=round(stat.win_rate, 3),
    )


NOT_ADMIN_GRANT = "Kun en administrator kan give administratorrettigheder."
NOT_YOUR_PIN = "Du kan kun ændre din egen PIN."


def _may_grant_admin(actor: Player, requested: bool | None) -> None:
    """Only an admin hands out admin.

    Without this the flag is decoration: any member could promote themselves
    and walk into the two things admin still guards -- the squad, and what an
    admin privately thinks everyone is worth.
    """
    if requested is None or actor.is_admin:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=NOT_ADMIN_GRANT)


def _may_set_pin(actor: Player, subject_id: str) -> None:
    """Your own PIN is yours to change. Somebody else's is an admin's.

    Same reasoning as the flag above: a PIN you can overwrite is an account you
    can log into. Setting one on a player you are creating is not covered here
    -- nobody is logged in as a player that did not exist a moment ago.
    """
    if actor.is_admin or actor.id == subject_id:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=NOT_YOUR_PIN)


@router.get("/players", response_model=list[PlayerOut])
def list_players(db: DbSession = Depends(get_db)) -> list[Player]:
    return service.list_players(db)


@router.post("/players", response_model=PlayerOut, status_code=201)
def create_player(
    payload: PlayerCreate,
    db: DbSession = Depends(get_db),
    player: Player = Depends(current_user),
) -> Player:
    """Add a player. Any logged-in member, and ``entry_rating`` is required --
    a request without it is rejected by the schema before it reaches here.

    Whoever is standing in the hall when somebody new turns up can put them on
    the ladder. Handing out admin with them cannot.
    """
    _may_grant_admin(player, payload.is_admin or None)
    return service.create_player(
        db,
        name=payload.name,
        entry_rating=payload.entry_rating,
        is_guest=payload.is_guest,
        is_admin=payload.is_admin,
        pin=payload.pin,
    )


@router.post("/players/guest", response_model=PlayerOut, status_code=201)
def create_guest(
    payload: GuestCreate,
    db: DbSession = Depends(get_db),
    player: Player = Depends(current_user),
) -> Player:
    """Add a guest. Any logged-in player, not just an admin.

    Deliberately a route of its own rather than an opening-up of
    ``POST /players``: this one can only ever mint a guest with no PIN and no
    admin flag, so letting the whole team reach it hands nobody anything but
    a name on Sunday's list.
    """
    return service.create_guest(db, name=payload.name)


@router.patch("/players/{player_id}", response_model=PlayerOut)
def update_player(
    player_id: str,
    payload: PlayerUpdate,
    db: DbSession = Depends(get_db),
    actor: Player = Depends(current_user),
) -> Player:
    """Edit a player. Any logged-in member. Flipping ``is_guest`` promotes a
    guest to a member, which is how someone joins the ladder for real."""
    _may_grant_admin(actor, payload.is_admin)
    if payload.pin is not None:
        _may_set_pin(actor, player_id)
    return service.update_player(
        db,
        player_id,
        name=payload.name,
        is_guest=payload.is_guest,
        entry_rating=payload.entry_rating,
        is_admin=payload.is_admin,
        pin=payload.pin,
    )


@router.get("/ladder", response_model=LadderOut)
def get_ladder(
    season: str | None = Query(default=None, description="Season id, or 'all' for all-time."),
    include_guests: bool = Query(
        default=False,
        description="Include guests in the ranking. Presentation only: guest "
        "matches always feed the rating engine either way.",
    ),
    db: DbSession = Depends(get_db),
) -> LadderOut:
    ladder, target = service.get_ladder(db, season, include_guests=include_guests)
    return LadderOut(
        mode="season" if target else "all",
        season=SeasonRef(id=target.id, name=target.name) if target else None,
        threshold=ladder.threshold,
        includes_guests=ladder.includes_guests,
        guest_count=ladder.guest_count,
        entries=[LadderEntryOut(**vars(entry)) for entry in ladder.entries],
    )


@router.get("/players/{player_id}", response_model=ProfileOut)
def get_profile(player_id: str, db: DbSession = Depends(get_db)) -> ProfileOut:
    profile = service.get_profile(db, player_id)
    return ProfileOut(
        player=PlayerOut(
            id=profile.player.id,
            name=profile.player.name,
            is_guest=profile.player.is_guest,
            entry_rating=profile.player.entry_rating,
        ),
        rating=profile.rating,
        start_rating=profile.start_rating,
        rank=profile.rank,
        rank_with_guests=profile.rank_with_guests,
        matches_played=profile.matches_played,
        wins=profile.wins,
        losses=profile.losses,
        draws=profile.draws,
        form=profile.form,
        active=profile.active,
        curve=[
            CurvePoint(match_id=mid, played_at=when, rating=value)
            for mid, when, value in profile.curve
        ],
        seasons=[SeasonStatOut(**vars(s)) for s in profile.seasons],
        partners=[p for p in (_pair(s) for s in profile.partners) if p],
        opponents=[p for p in (_pair(s) for s in profile.opponents) if p],
        highlights=HighlightsOut(
            **{key: _pair(value) for key, value in profile.highlights.items()},
            min_sample=service.MIN_HIGHLIGHT_SAMPLE,
        ),
    )


@auth_router.post("/login", response_model=MeOut)
def login(
    payload: LoginRequest, response: Response, db: DbSession = Depends(get_db)
) -> Player:
    player = service.authenticate(db, payload.player_id, payload.pin)
    set_session_cookie(response, player.id)
    return player


@auth_router.post("/logout", status_code=204)
def logout(response: Response) -> Response:
    clear_session_cookie(response)
    response.status_code = 204
    return response


@auth_router.get("/me", response_model=MeOut)
def me(player: Player = Depends(current_user)) -> Player:
    return player
