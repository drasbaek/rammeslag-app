"""Editing and deleting an evening after it was written.

An evening is typed in from memory, so it is typed in wrong sometimes: the
wrong date, the wrong kind of night, a match that never happened. Both fixes
have to leave the ladder correct, and neither one of them touches a stored
rating -- every number in this app is replayed from the matches on read, so
"recalculate" means "move the matches and read again".
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import select

from rammeslag.modules.matches.models import Match
from tests.conftest import (
    EFTERAAR,
    FORAAR,
    login,
    make_match,
    make_player,
    make_season,
    make_session,
)

PLAYED = ("p1", "p2", "p3", "p4")


def _seed(db) -> None:
    make_season(db, EFTERAAR, "season-1")
    make_season(db, FORAAR, "season-2")
    make_player(db, "regular", "Regular", pin="1234")
    make_player(db, "boss", "Boss", pin="9999", is_admin=True)
    for pid in PLAYED:
        make_player(db, pid)
    make_session(db, "s1", "season-1", date(2025, 9, 1), note="Bane 3")
    make_match(
        db,
        "m1",
        "s1",
        datetime(2025, 9, 1, 18, 0, tzinfo=UTC),
        ("p1", "p2"),
        ("p3", "p4"),
        [(6, 2)],
    )
    make_match(
        db,
        "m2",
        "s1",
        datetime(2025, 9, 1, 18, 30, tzinfo=UTC),
        ("p1", "p3"),
        ("p2", "p4"),
        [(6, 4)],
    )


def _ratings(client) -> dict[str, float]:
    """All-time rating for the four who played. The two logins never do."""
    entries = client.get("/api/ladder?season=all").json()["entries"]
    return {e["player_id"]: e["rating"] for e in entries if e["player_id"] in PLAYED}


def test_editing_type_and_note_leaves_the_matches_alone(client, db) -> None:
    _seed(db)
    before = _ratings(client)
    login(client, "regular", "1234")

    response = client.patch("/api/sessions/s1", json={"type": "casual", "note": "Kold hal"})

    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "casual"
    assert body["note"] == "Kold hal"
    assert body["match_count"] == 2
    assert _ratings(client) == before


def test_an_empty_note_clears_it(client, db) -> None:
    _seed(db)
    login(client, "regular", "1234")

    assert client.patch("/api/sessions/s1", json={"note": "   "}).json()["note"] is None


def test_an_omitted_field_is_left_alone(client, db) -> None:
    _seed(db)
    login(client, "regular", "1234")

    body = client.patch("/api/sessions/s1", json={"type": "casual"}).json()

    assert body["note"] == "Bane 3"
    assert body["played_on"] == "2025-09-01"


def test_moving_the_date_moves_the_matches_and_the_season(client, db) -> None:
    """The evening is replayed where it is listed.

    Ratings are a chronological replay over ``matches.played_at``. A session
    re-dated into another season whose matches stayed in September would show
    up in Forår 2026 on the list and count toward Efterår 2025 on the ladder.
    """
    _seed(db)
    login(client, "regular", "1234")

    response = client.patch("/api/sessions/s1", json={"played_on": "2026-02-02"})

    assert response.status_code == 200
    body = response.json()
    assert body["played_on"] == "2026-02-02"
    assert body["season"]["name"] == FORAAR[0]

    db.expire_all()
    stamps = sorted(
        m.played_at for m in db.execute(select(Match).where(Match.session_id == "s1")).scalars()
    )
    # Shifted by the same number of days, so the order inside the evening holds.
    assert [s.date() for s in stamps] == [date(2026, 2, 2), date(2026, 2, 2)]
    assert [s.strftime("%H:%M") for s in stamps] == ["18:00", "18:30"]

    # The season board only counts what falls inside its own window.
    season_one = client.get("/api/ladder?season=season-1").json()
    assert all(entry["matches_played"] == 0 for entry in season_one["entries"])
    season_two = client.get("/api/ladder?season=season-2").json()
    assert {e["player_id"]: e["matches_played"] for e in season_two["entries"]}["p1"] == 2


def test_a_date_no_season_covers_is_refused(client, db) -> None:
    _seed(db)
    login(client, "regular", "1234")

    response = client.patch("/api/sessions/s1", json={"played_on": "2025-12-24"})

    assert response.status_code == 404
    assert response.json()["detail"] == "Der findes ingen sæson, der dækker den dato."
    # Nothing was written: the refusal is total, not partial.
    assert client.get("/api/sessions/s1").json()["played_on"] == "2025-09-01"


def test_a_refused_edit_writes_nothing_at_all(client, db) -> None:
    _seed(db)
    login(client, "regular", "1234")

    response = client.patch(
        "/api/sessions/s1", json={"type": "vinsmagning", "note": "Skal ikke gemmes"}
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Ukendt sessionstype."
    detail = client.get("/api/sessions/s1").json()
    assert detail["type"] == "training"
    assert detail["note"] == "Bane 3"


def test_editing_requires_a_logged_in_player(client, db) -> None:
    _seed(db)
    assert client.patch("/api/sessions/s1", json={"type": "casual"}).status_code == 401


def test_editing_an_unknown_session_is_a_404(client, db) -> None:
    _seed(db)
    login(client, "regular", "1234")

    response = client.patch("/api/sessions/nope", json={"type": "casual"})

    assert response.status_code == 404
    assert response.json()["detail"] == "Sessionen findes ikke."


def test_deleting_a_session_takes_its_matches_and_its_rating_with_it(client, db) -> None:
    _seed(db)
    assert _ratings(client) != {pid: 1000.0 for pid in PLAYED}
    login(client, "boss", "9999")

    assert client.delete("/api/sessions/s1").status_code == 204

    assert client.get("/api/sessions/s1").status_code == 404
    db.expire_all()
    assert db.execute(select(Match).where(Match.session_id == "s1")).scalars().all() == []
    # Back to where everybody started: the replay has nothing left to apply.
    assert _ratings(client) == {pid: 1000.0 for pid in PLAYED}
