"""Admin player management.

Adding a player is an admin act with one required judgement call:
``entry_rating``. Editing one is how a guest becomes a member -- guest status
is a meaningful distinction, not a stale flag (docs/RATING.md).
"""

from __future__ import annotations

from datetime import date

from rammeslag.deps import NOT_ADMIN, NOT_LOGGED_IN
from tests.conftest import EFTERAAR, login, make_player, make_season, make_session


def _seed(db) -> None:
    make_season(db, EFTERAAR, "season-1")
    make_player(db, "boss", "Boss", pin="9999", is_admin=True)
    make_player(db, "regular", "Regular", pin="1234")
    make_session(db, "s1", "season-1", date(2025, 9, 1))


# --------------------------------------------------------------------------
# Creating
# --------------------------------------------------------------------------


def test_admin_creates_a_player_with_an_entry_rating(client, db) -> None:
    _seed(db)
    login(client, "boss", "9999")
    response = client.post(
        "/api/players", json={"name": "Nyt Medlem", "entry_rating": 1150.0}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Nyt Medlem"
    assert body["entry_rating"] == 1150.0
    assert body["is_guest"] is False
    assert body["id"].startswith("player-")

    assert "Nyt Medlem" in {p["name"] for p in client.get("/api/players").json()}


def test_create_without_an_entry_rating_is_rejected(client, db) -> None:
    """There is no default. An admin decides, or the request fails."""
    _seed(db)
    login(client, "boss", "9999")
    response = client.post("/api/players", json={"name": "Uden Tal"})
    assert response.status_code == 422
    assert "entry_rating" in response.text

    assert "Uden Tal" not in {p["name"] for p in client.get("/api/players").json()}


def test_create_requires_admin(client, db) -> None:
    _seed(db)
    assert client.post("/api/players", json={"name": "X", "entry_rating": 1000}).json()[
        "detail"
    ] == NOT_LOGGED_IN

    login(client, "regular", "1234")
    response = client.post("/api/players", json={"name": "X", "entry_rating": 1000})
    assert response.status_code == 403
    assert response.json()["detail"] == NOT_ADMIN


def test_duplicate_names_are_refused_in_danish(client, db) -> None:
    _seed(db)
    login(client, "boss", "9999")
    client.post("/api/players", json={"name": "Dublet", "entry_rating": 1000})
    response = client.post("/api/players", json={"name": "Dublet", "entry_rating": 1000})
    assert response.status_code == 400
    assert response.json()["detail"] == "Der findes allerede en spiller med det navn."


def test_a_created_guest_stays_off_the_default_ladder(client, db) -> None:
    _seed(db)
    login(client, "boss", "9999")
    created = client.post(
        "/api/players", json={"name": "Gæst", "entry_rating": 1000, "is_guest": True}
    ).json()

    ladder = client.get("/api/ladder?season=all").json()
    assert created["id"] not in {e["player_id"] for e in ladder["entries"]}
    assert ladder["guest_count"] == 1

    with_guests = client.get("/api/ladder?season=all&include_guests=true").json()
    assert created["id"] in {e["player_id"] for e in with_guests["entries"]}


# --------------------------------------------------------------------------
# Editing
# --------------------------------------------------------------------------


def test_admin_promotes_a_guest_to_a_member(client, db) -> None:
    """Three players have already made this move in real life."""
    _seed(db)
    make_player(db, "visitor", "Visitor", is_guest=True)
    login(client, "boss", "9999")

    before = client.get("/api/ladder?season=all").json()
    assert "visitor" not in {e["player_id"] for e in before["entries"]}

    response = client.patch("/api/players/visitor", json={"is_guest": False})
    assert response.status_code == 200
    assert response.json()["is_guest"] is False

    after = client.get("/api/ladder?season=all").json()
    assert "visitor" in {e["player_id"] for e in after["entries"]}
    assert after["guest_count"] == 0


def test_admin_edits_name_and_entry_rating(client, db) -> None:
    _seed(db)
    make_player(db, "typo", "Mikkle", entry_rating=1000.0)
    login(client, "boss", "9999")

    response = client.patch(
        "/api/players/typo", json={"name": "Mikkel", "entry_rating": 1120.0}
    )
    assert response.status_code == 200
    assert response.json() == {
        "id": "typo",
        "name": "Mikkel",
        "is_guest": False,
        "entry_rating": 1120.0,
    }
    # The entry rating is the replay's starting point, so the ladder moves with it.
    entries = {e["player_id"]: e for e in client.get("/api/ladder?season=all").json()["entries"]}
    assert entries["typo"]["rating"] == 1120.0


def test_a_partial_patch_leaves_everything_else_alone(client, db) -> None:
    _seed(db)
    make_player(db, "keep", "Keep", entry_rating=1075.0, is_guest=True)
    login(client, "boss", "9999")

    body = client.patch("/api/players/keep", json={"name": "Keeper"}).json()
    assert body["entry_rating"] == 1075.0
    assert body["is_guest"] is True


def test_editing_requires_admin(client, db) -> None:
    _seed(db)
    assert client.patch("/api/players/regular", json={"name": "X"}).status_code == 401
    login(client, "regular", "1234")
    response = client.patch("/api/players/boss", json={"is_admin": False})
    assert response.status_code == 403
    assert response.json()["detail"] == NOT_ADMIN


def test_editing_an_unknown_player_is_a_danish_404(client, db) -> None:
    _seed(db)
    login(client, "boss", "9999")
    response = client.patch("/api/players/nobody", json={"name": "X"})
    assert response.status_code == 404
    assert response.json()["detail"] == "Spilleren findes ikke."


def test_renaming_onto_another_player_is_refused(client, db) -> None:
    _seed(db)
    login(client, "boss", "9999")
    response = client.patch("/api/players/regular", json={"name": "Boss"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Der findes allerede en spiller med det navn."
    # Renaming a player to their own name is not a clash.
    assert client.patch("/api/players/regular", json={"name": "Regular"}).status_code == 200


def test_setting_a_pin_lets_a_player_log_in(client, db) -> None:
    _seed(db)
    login(client, "boss", "9999")
    created = client.post(
        "/api/players", json={"name": "Med Pin", "entry_rating": 1000, "pin": "4321"}
    ).json()
    client.post("/api/auth/logout")

    assert login(client, created["id"], "4321").status_code == 200
    assert client.get("/api/auth/me").json()["name"] == "Med Pin"
