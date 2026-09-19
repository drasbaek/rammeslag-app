"""Season management.

Sessions cannot exist outside a season (``sessions.season_id`` is NOT NULL),
so creating one is what unblocks recording a training after the calendar moves
past the last season's end date. Two rules make that safe: seasons may not
overlap, and narrowing one may not strand the sessions already inside it.
"""

from __future__ import annotations

from datetime import date

from tests.conftest import EFTERAAR, login, make_player, make_season, make_session


def _seed(db) -> None:
    make_season(db, EFTERAAR, "season-1")
    make_player(db, "boss", "Boss", pin="9999", is_admin=True)
    make_player(db, "regular", "Regular", pin="1234")


# --------------------------------------------------------------------------
# Access
# --------------------------------------------------------------------------


def test_anyone_may_read_seasons(client, db) -> None:
    _seed(db)
    response = client.get("/api/seasons")
    assert response.status_code == 200
    assert [s["name"] for s in response.json()] == [EFTERAAR[0]]


def test_creating_a_season_needs_admin(client, db) -> None:
    _seed(db)
    payload = {"name": "Efterår 2026", "starts_on": "2026-09-01", "ends_on": "2026-12-20"}

    assert client.post("/api/seasons", json=payload).status_code == 401

    login(client, "regular", "1234")
    assert client.post("/api/seasons", json=payload).status_code == 403


# --------------------------------------------------------------------------
# Creating
# --------------------------------------------------------------------------


def test_admin_creates_a_season(client, db) -> None:
    _seed(db)
    login(client, "boss", "9999")
    response = client.post(
        "/api/seasons",
        json={"name": "Efterår 2026", "starts_on": "2026-09-01", "ends_on": "2026-12-20"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Efterår 2026"
    assert body["starts_on"] == "2026-09-01"
    assert body["id"].startswith("season-")


def test_a_season_may_not_end_before_it_starts(client, db) -> None:
    _seed(db)
    login(client, "boss", "9999")
    response = client.post(
        "/api/seasons",
        json={"name": "Bagvendt", "starts_on": "2026-12-01", "ends_on": "2026-09-01"},
    )
    assert response.status_code == 400
    assert "slutter før" in response.json()["detail"]


def test_seasons_may_not_overlap(client, db) -> None:
    """resolve_season_for_session picks the one season covering a date, so two
    overlapping seasons would make that answer arbitrary."""
    _seed(db)
    login(client, "boss", "9999")
    start, end = EFTERAAR[1], EFTERAAR[2]
    response = client.post(
        "/api/seasons",
        json={
            "name": "Overlapper",
            "starts_on": str(start),
            "ends_on": str(end),
        },
    )
    assert response.status_code == 400
    assert "overlapper" in response.json()["detail"].lower()


def test_two_seasons_may_not_share_a_name(client, db) -> None:
    _seed(db)
    login(client, "boss", "9999")
    response = client.post(
        "/api/seasons",
        json={"name": EFTERAAR[0], "starts_on": "2027-01-01", "ends_on": "2027-03-01"},
    )
    assert response.status_code == 400


# --------------------------------------------------------------------------
# Editing
# --------------------------------------------------------------------------


def test_admin_renames_a_season(client, db) -> None:
    _seed(db)
    login(client, "boss", "9999")
    response = client.patch("/api/seasons/season-1", json={"name": "Efterår 25"})
    assert response.status_code == 200
    assert response.json()["name"] == "Efterår 25"
    # Dates are untouched by a rename.
    assert response.json()["starts_on"] == str(EFTERAAR[1])


def test_narrowing_a_season_may_not_strand_its_sessions(client, db) -> None:
    """sessions.season_id is NOT NULL, so a session outside its own season
    would be invisible to every date-based query while still counting toward
    that season's standings."""
    _seed(db)
    make_session(db, "s1", "season-1", EFTERAAR[1])
    login(client, "boss", "9999")

    later = date(EFTERAAR[1].year, EFTERAAR[1].month, EFTERAAR[1].day + 1)
    response = client.patch("/api/seasons/season-1", json={"starts_on": str(later)})

    assert response.status_code == 400
    assert "uden for" in response.json()["detail"]
    # ...and the season is unchanged.
    assert client.get("/api/seasons").json()[0]["starts_on"] == str(EFTERAAR[1])


def test_widening_a_season_is_fine(client, db) -> None:
    _seed(db)
    make_session(db, "s1", "season-1", EFTERAAR[1])
    login(client, "boss", "9999")
    response = client.patch("/api/seasons/season-1", json={"ends_on": "2025-12-31"})
    assert response.status_code == 200
    assert response.json()["ends_on"] == "2025-12-31"


def test_editing_a_missing_season_is_404(client, db) -> None:
    _seed(db)
    login(client, "boss", "9999")
    assert client.patch("/api/seasons/season-nope", json={"name": "X"}).status_code == 404
