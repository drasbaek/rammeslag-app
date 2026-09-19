"""Auth: the signed cookie, the pin, and the two gates.

Reads are public, writes need a player session, deletes need admin. Every
message a player can see is Danish.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from rammeslag.deps import NOT_ADMIN, NOT_LOGGED_IN, issue_token, read_token
from rammeslag.modules.players.service import hash_pin, verify_pin
from tests.conftest import (
    EFTERAAR,
    login,
    make_match,
    make_player,
    make_season,
    make_session,
)


def test_pin_round_trip() -> None:
    digest = hash_pin("1234")
    assert digest != "1234"
    assert verify_pin("1234", digest)
    assert not verify_pin("4321", digest)
    assert not verify_pin("1234", None)


def test_token_round_trip_and_tampering(engine) -> None:
    token = issue_token("player-1")
    assert read_token(token) == "player-1"
    assert read_token(None) is None
    assert read_token("nonsense") is None
    # Flip a character in the payload: the signature no longer matches.
    assert read_token(token[:-2] + ("aa" if not token.endswith("aa") else "bb")) is None


def _seed(db) -> None:
    make_season(db, EFTERAAR, "season-1")
    make_player(db, "regular", "Regular", pin="1234")
    make_player(db, "boss", "Boss", pin="9999", is_admin=True)
    for pid in ("p1", "p2", "p3", "p4"):
        make_player(db, pid)
    make_session(db, "s1", "season-1", date(2025, 9, 1))
    make_match(
        db,
        "m1",
        "s1",
        datetime(2025, 9, 1, 18, 0, tzinfo=UTC),
        ("p1", "p2"),
        ("p3", "p4"),
        [(6, 2)],
    )


def test_login_sets_a_cookie_and_me_returns_the_player(client, db) -> None:
    _seed(db)
    response = login(client, "regular", "1234")
    assert response.status_code == 200
    assert response.json()["name"] == "Regular"
    assert "rammeslag_session" in response.cookies

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json() == {
        "id": "regular",
        "name": "Regular",
        "is_guest": False,
        "is_admin": False,
        "entry_rating": 1000.0,
    }


def test_wrong_pin_is_rejected_in_danish(client, db) -> None:
    _seed(db)
    response = login(client, "regular", "0000")
    assert response.status_code == 401
    assert response.json()["detail"] == "Forkert spiller eller pinkode."


def test_unknown_player_gets_the_same_message(client, db) -> None:
    _seed(db)
    response = login(client, "nobody", "1234")
    assert response.status_code == 401
    assert response.json()["detail"] == "Forkert spiller eller pinkode."


def test_logout_clears_the_session(client, db) -> None:
    _seed(db)
    login(client, "regular", "1234")
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_reads_are_public(client, db) -> None:
    _seed(db)
    for url in ("/api/health", "/api/players", "/api/ladder", "/api/seasons", "/api/sessions"):
        assert client.get(url).status_code == 200, url
    assert client.get("/api/sessions/s1").status_code == 200
    assert client.get("/api/players/p1").status_code == 200


def test_writes_require_a_session(client, db) -> None:
    _seed(db)
    response = client.post("/api/sessions", json={"played_on": "2025-09-08"})
    assert response.status_code == 401
    assert response.json()["detail"] == NOT_LOGGED_IN

    response = client.post(
        "/api/matches",
        json={
            "session_id": "s1",
            "team_a": ["p1", "p2"],
            "team_b": ["p3", "p4"],
            "sets": [{"games_a": 6, "games_b": 1}],
        },
    )
    assert response.status_code == 401


def test_a_logged_in_player_may_write(client, db) -> None:
    _seed(db)
    login(client, "regular", "1234")
    response = client.post("/api/sessions", json={"played_on": "2025-09-08"})
    assert response.status_code == 201
    assert client.post(f"/api/sessions/{response.json()['id']}/close").status_code == 200


def test_deletes_require_admin(client, db) -> None:
    _seed(db)
    login(client, "regular", "1234")
    response = client.delete("/api/matches/m1")
    assert response.status_code == 403
    assert response.json()["detail"] == NOT_ADMIN
    assert client.delete("/api/sessions/s1").status_code == 403


def test_admin_may_delete(client, db) -> None:
    _seed(db)
    login(client, "boss", "9999")
    assert client.delete("/api/matches/m1").status_code == 204
    assert client.delete("/api/sessions/s1").status_code == 204


def test_a_player_without_a_pin_cannot_log_in(client, db) -> None:
    _seed(db)
    response = login(client, "p1", "1234")
    assert response.status_code == 401
