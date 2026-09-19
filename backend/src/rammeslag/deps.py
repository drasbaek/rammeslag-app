"""Request dependencies: database session, current player, admin gate.

Session transport lives here and only here. It is a signed, httponly cookie
carrying nothing but a player id -- deliberately the smallest thing that works
for ten friends. Swapping this file for an OAuth callback later changes no
router and no service.
"""

from __future__ import annotations

from collections.abc import Iterator
from functools import lru_cache

from fastapi import Depends, HTTPException, Request, Response, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy.orm import Session as DbSession

from rammeslag.config import get_settings
from rammeslag.db import get_sessionmaker
from rammeslag.modules.players.models import Player

SESSION_SALT = "rammeslag.session.v1"

# Danish, because a player reads these.
NOT_LOGGED_IN = "Du skal være logget ind for at gøre det."
NOT_ADMIN = "Kun en administrator kan gøre det."
UNKNOWN_PLAYER = "Din session er ikke gyldig længere. Log ind igen."


def get_db() -> Iterator[DbSession]:
    db = get_sessionmaker()()
    try:
        yield db
    finally:
        db.close()


@lru_cache(maxsize=1)
def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_settings().session_secret, salt=SESSION_SALT)


def reset_serializer_cache() -> None:
    """Tests patch the secret; drop the memoised serializer."""
    _serializer.cache_clear()


def issue_token(player_id: str) -> str:
    return _serializer().dumps(player_id)


def read_token(token: str | None) -> str | None:
    """Player id from a signed token, or None if absent, tampered or expired."""
    if not token:
        return None
    try:
        value = _serializer().loads(token, max_age=get_settings().session_max_age_seconds)
    except (BadSignature, SignatureExpired):
        return None
    return value if isinstance(value, str) else None


def set_session_cookie(response: Response, player_id: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.cookie_name,
        value=issue_token(player_id),
        max_age=settings.session_max_age_seconds,
        httponly=True,
        secure=settings.cookie_secure and not settings.is_development,
        samesite=settings.cookie_samesite,  # type: ignore[arg-type]
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=get_settings().cookie_name, path="/")


def optional_user(request: Request, db: DbSession = Depends(get_db)) -> Player | None:
    """The logged-in player, or None. Used by public reads that vary slightly."""
    player_id = read_token(request.cookies.get(get_settings().cookie_name))
    if player_id is None:
        return None
    return db.get(Player, player_id)


def current_user(request: Request, db: DbSession = Depends(get_db)) -> Player:
    """The logged-in player. 401 if there is none. Every write depends on this."""
    player_id = read_token(request.cookies.get(get_settings().cookie_name))
    if player_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=NOT_LOGGED_IN)
    player = db.get(Player, player_id)
    if player is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=UNKNOWN_PLAYER)
    return player


def require_admin(player: Player = Depends(current_user)) -> Player:
    """Admin gate. Every delete depends on this."""
    if not player.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=NOT_ADMIN)
    return player
