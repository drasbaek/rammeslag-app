"""Match validation and entry-time timestamps.

The engine deliberately validates nothing (docs/RATING.md, "Validation is the
caller's job"), so these four rules live here and are enforced before anything
is written:

* four distinct players
* every set's games are non-negative
* at least one game in total
* one to three sets
"""

from __future__ import annotations

from datetime import date

import pytest

from rammeslag.modules.matches.service import (
    DomainError,
    validate_sets,
    validate_teams,
)
from tests.conftest import EFTERAAR, login, make_player, make_season, make_session

PLAYERS = ("p1", "p2", "p3", "p4", "p5")


def _seed(db) -> None:
    make_season(db, EFTERAAR, "season-1")
    make_player(db, "boss", "Boss", pin="9999", is_admin=True)
    for pid in PLAYERS:
        make_player(db, pid)
    make_session(db, "s1", "season-1", date(2025, 9, 1))


def _payload(**overrides) -> dict:
    body = {
        "session_id": "s1",
        "team_a": ["p1", "p2"],
        "team_b": ["p3", "p4"],
        "sets": [{"games_a": 6, "games_b": 4}],
    }
    body.update(overrides)
    return body


# --------------------------------------------------------------------------
# The rules, as pure functions
# --------------------------------------------------------------------------


def test_four_distinct_players_is_enforced() -> None:
    validate_teams(["p1", "p2"], ["p3", "p4"])

    with pytest.raises(DomainError, match="fire forskellige spillere"):
        validate_teams(["p1", "p2"], ["p2", "p4"])
    with pytest.raises(DomainError, match="fire forskellige spillere"):
        validate_teams(["p1", "p1"], ["p3", "p4"])
    with pytest.raises(DomainError, match="to spillere"):
        validate_teams(["p1"], ["p3", "p4"])


def test_sets_must_be_one_to_three_and_non_negative() -> None:
    validate_sets([(6, 4)])
    validate_sets([(6, 4), (3, 6), (7, 6)])

    with pytest.raises(DomainError, match="mindst ét sæt"):
        validate_sets([])
    with pytest.raises(DomainError, match="højst have tre sæt"):
        validate_sets([(6, 4), (6, 4), (6, 4), (6, 4)])
    with pytest.raises(DomainError, match="ikke være negativt"):
        validate_sets([(6, -1)])


def test_a_match_needs_at_least_one_game() -> None:
    """The engine tolerates a 0-0 defensively; the app refuses to write one."""
    with pytest.raises(DomainError, match="mindst ét spillet parti"):
        validate_sets([(0, 0)])
    with pytest.raises(DomainError, match="mindst ét spillet parti"):
        validate_sets([(0, 0), (0, 0)])
    # A drawn match that was actually played is fine.
    validate_sets([(3, 3)])


# --------------------------------------------------------------------------
# The same rules over HTTP
# --------------------------------------------------------------------------


def test_a_valid_match_is_written_and_carries_its_deltas(client, db) -> None:
    _seed(db)
    login(client, "boss", "9999")
    response = client.post("/api/matches", json=_payload())
    assert response.status_code == 201

    body = response.json()
    assert body["games_a"] == 6
    assert body["games_b"] == 4
    assert body["winner"] == "A"
    assert [p["id"] for p in body["team_a"]] == ["p1", "p2"]
    assert set(body["deltas"]) == {"p1", "p2", "p3", "p4"}
    assert body["deltas"]["p1"] > 0
    assert body["deltas"]["p3"] < 0


@pytest.mark.parametrize(
    ("overrides", "status"),
    [
        # A player on both teams: caught by the request schema.
        ({"team_a": ["p1", "p2"], "team_b": ["p2", "p3"]}, 422),
        # A player partnered with themselves.
        ({"team_a": ["p1", "p1"], "team_b": ["p3", "p4"]}, 422),
        # Three players.
        ({"team_a": ["p1"], "team_b": ["p3", "p4"]}, 422),
        # Negative games.
        ({"sets": [{"games_a": 6, "games_b": -1}]}, 422),
        # No sets at all.
        ({"sets": []}, 422),
        # Four sets.
        ({"sets": [{"games_a": 6, "games_b": 4}] * 4}, 422),
    ],
)
def test_invalid_matches_are_refused(client, db, overrides, status) -> None:
    _seed(db)
    login(client, "boss", "9999")
    assert client.post("/api/matches", json=_payload(**overrides)).status_code == status
    assert client.get("/api/sessions/s1").json()["matches"] == []


def test_a_match_with_no_games_is_refused_in_danish(client, db) -> None:
    _seed(db)
    login(client, "boss", "9999")
    response = client.post("/api/matches", json=_payload(sets=[{"games_a": 0, "games_b": 0}]))
    assert response.status_code == 400
    assert response.json()["detail"] == "En kamp skal have mindst ét spillet parti."


def test_an_unknown_player_is_refused(client, db) -> None:
    _seed(db)
    login(client, "boss", "9999")
    response = client.post("/api/matches", json=_payload(team_b=["p3", "ghost"]))
    assert response.status_code == 400
    assert response.json()["detail"] == "En eller flere spillere findes ikke."


def test_a_closed_session_takes_no_more_matches(client, db) -> None:
    _seed(db)
    login(client, "boss", "9999")
    client.post("/api/sessions/s1/close")
    response = client.post("/api/matches", json=_payload())
    assert response.status_code == 400
    assert "lukket" in response.json()["detail"]


def test_an_unknown_session_is_a_danish_404(client, db) -> None:
    _seed(db)
    login(client, "boss", "9999")
    response = client.post("/api/matches", json=_payload(session_id="s-nope"))
    assert response.status_code == 404
    assert response.json()["detail"] == "Sessionen findes ikke."


# --------------------------------------------------------------------------
# played_at is stamped at entry time
# --------------------------------------------------------------------------


def test_six_matches_in_one_session_replay_in_entry_order(client, db) -> None:
    """docs/RATING.md: match_id is a weak tie-break, so the timestamps must
    separate matches inside one evening."""
    _seed(db)
    login(client, "boss", "9999")

    created = []
    for _ in range(6):
        response = client.post("/api/matches", json=_payload())
        assert response.status_code == 201
        created.append(response.json())

    stamps = [m["played_at"] for m in created]
    assert len(set(stamps)) == 6
    assert stamps == sorted(stamps)

    # The session detail replays them in the same order.
    detail = client.get("/api/sessions/s1").json()
    assert [m["id"] for m in detail["matches"]] == [m["id"] for m in created]


def test_played_at_is_not_taken_from_the_client(client, db) -> None:
    """A client-supplied timestamp could reorder the replay. It is ignored."""
    _seed(db)
    login(client, "boss", "9999")
    body = client.post(
        "/api/matches", json=_payload(played_at="2001-01-01T00:00:00Z")
    ).json()
    assert not body["played_at"].startswith("2001")


def test_deleting_a_match_replays_the_rest(client, db) -> None:
    _seed(db)
    login(client, "boss", "9999")
    first = client.post("/api/matches", json=_payload()).json()
    client.post("/api/matches", json=_payload(team_a=["p1", "p3"], team_b=["p2", "p4"]))

    before = {
        e["player_id"]: e["rating"]
        for e in client.get("/api/ladder?season=all").json()["entries"]
    }
    assert client.delete(f"/api/matches/{first['id']}").status_code == 204
    after = {
        e["player_id"]: e["rating"]
        for e in client.get("/api/ladder?season=all").json()["entries"]
    }
    assert before["p1"] != after["p1"]
    # p5 never played; a delete cannot move them.
    assert before["p5"] == after["p5"]
