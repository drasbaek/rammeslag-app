"""Saying whether you are coming, and what an admin does with the answers.

Two things are being tested here that matter more than the CRUD. One is that
availability and selection never infer each other: saying "klar" is not being
picked, and being picked is not a claim that you said klar. The other is that
no route in this module can move a rating -- the planned line-ups are a
whiteboard, and the only thing that writes a ``Match`` is still score entry.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time

import pytest

from rammeslag.modules.events import service
from rammeslag.modules.events.models import Event, EventMatchup, EventResponse
from rammeslag.modules.matches.models import Match
from rammeslag.modules.matches.service import DomainError
from rammeslag.modules.rating.constants import SEED_RATING
from tests.conftest import (
    EFTERAAR,
    login,
    make_event,
    make_match,
    make_player,
    make_season,
    make_session,
)

SQUAD = ("p1", "p2", "p3", "p4", "p5", "p6")


def _seed(db) -> None:
    make_season(db, EFTERAAR, "season-1")
    make_player(db, "regular", "Regular Reg", pin="1234")
    make_player(db, "boss", "Boss Bossen", pin="9999", is_admin=True)
    for pid in SQUAD:
        make_player(db, pid)


# --------------------------------------------------------------------------
# Pure
# --------------------------------------------------------------------------


def test_surplus_is_the_old_spreadsheets_bottom_row() -> None:
    """Ten klar against a squad of six is the sheet's "+4". A maybe is not a
    player: "Ved ikke" never filled a court and never counted towards one."""
    counts = service.count_responses(["yes"] * 10 + ["no"] * 2 + ["maybe"], member_count=13)
    view = service.EventView(
        id="e",
        season_id="s",
        season_name="Efterår",
        type="match",
        held_on=date(2025, 9, 8),
        start_time=time(18, 0),
        venue="Grenaa",
        opponent="Astronauterne",
        capacity=6,
        status="open",
        note=None,
        session_id=None,
        counts=counts,
        selected_count=0,
    )
    assert view.surplus == 4


def test_a_hole_in_the_squad_reads_as_a_negative_surplus() -> None:
    counts = service.count_responses(["yes"] * 4 + ["no"] * 3, member_count=13)
    assert counts.yes - 6 == -2


def test_unanswered_counts_members_only_and_never_goes_negative() -> None:
    """Guests push the answered count past the membership. "Mangler svar fra
    -2 spillere" would be nonsense on a screen."""
    counts = service.count_responses(["yes"] * 15, member_count=13)
    assert counts.unanswered == 0


def test_default_capacity_is_six_for_a_fixture_and_three_courts_for_a_training() -> None:
    assert service.default_capacity("match") == 6
    assert service.default_capacity("training") == 12
    assert service.courts_for(12) == 3
    assert service.courts_for(8) == 2


def test_a_player_cannot_be_on_two_courts_in_the_same_round() -> None:
    plan = [
        service.MatchupInput(round=1, court=1, team_a=("a", "b"), team_b=("c", "d")),
        service.MatchupInput(round=1, court=2, team_a=("a", "e"), team_b=("f", "g")),
    ]
    with pytest.raises(DomainError, match="to baner"):
        service.validate_matchups(plan)


def test_the_same_court_cannot_be_booked_twice_in_one_round() -> None:
    plan = [
        service.MatchupInput(round=1, court=1, team_a=("a", "b"), team_b=("c", "d")),
        service.MatchupInput(round=1, court=1, team_a=("e", "f"), team_b=("g", "h")),
    ]
    with pytest.raises(DomainError, match="to gange"):
        service.validate_matchups(plan)


def test_the_same_player_may_appear_in_a_later_round() -> None:
    service.validate_matchups(
        [
            service.MatchupInput(round=1, court=1, team_a=("a", "b"), team_b=("c", "d")),
            service.MatchupInput(round=2, court=1, team_a=("a", "c"), team_b=("b", "d")),
        ]
    )


# --------------------------------------------------------------------------
# Creating and listing
# --------------------------------------------------------------------------


def test_only_an_admin_creates_an_event(client, db) -> None:
    _seed(db)
    login(client, "regular", "1234")

    response = client.post(
        "/api/events",
        json={
            "type": "match",
            "held_on": "2025-09-08",
            "start_time": "18:00:00",
            "venue": "Grenaa",
            "opponent": "Astronauterne",
        },
    )

    assert response.status_code == 403


def test_a_fixture_takes_a_squad_of_six_without_being_told(client, db) -> None:
    _seed(db)
    login(client, "boss", "9999")

    body = client.post(
        "/api/events",
        json={
            "type": "match",
            "held_on": "2025-09-08",
            "start_time": "18:00:00",
            "venue": "Grenaa",
            "opponent": "Astronauterne",
        },
    ).json()

    assert body["capacity"] == 6
    assert body["opponent"] == "Astronauterne"
    assert body["season"]["name"] == "Efterår 2025"
    assert body["surplus"] == -6  # nobody has answered yet


def test_a_training_takes_three_courts_and_never_an_opponent(client, db) -> None:
    """A Sunday has no opponent. Sending one anyway must not put a ghost club
    in the header of every training."""
    _seed(db)
    login(client, "boss", "9999")

    body = client.post(
        "/api/events",
        json={
            "type": "training",
            "held_on": "2025-09-07",
            "start_time": "10:00:00",
            "venue": "Pakhus77",
            "opponent": "Piverts",
        },
    ).json()

    assert body["capacity"] == 12
    assert body["opponent"] is None


def test_a_date_outside_every_season_is_refused(client, db) -> None:
    _seed(db)
    login(client, "boss", "9999")

    response = client.post(
        "/api/events",
        json={
            "type": "training",
            "held_on": "2024-01-01",
            "start_time": "10:00:00",
            "venue": "Pakhus77",
        },
    )

    assert response.status_code == 404


def test_listing_defaults_to_what_is_still_coming(client, db) -> None:
    _seed(db)
    make_event(db, "past", "season-1", date(2025, 8, 26))
    make_event(db, "soon", "season-1", date(2099, 1, 1))

    upcoming = client.get("/api/events").json()
    past = client.get("/api/events?scope=past").json()

    assert [e["id"] for e in upcoming] == ["soon"]
    assert [e["id"] for e in past] == ["past"]


def test_reads_are_public(client, db) -> None:
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1))

    assert client.get("/api/events").status_code == 200
    assert client.get("/api/events/e1").status_code == 200
    # Nobody is logged in, so there is no "my answer" to report.
    assert client.get("/api/events/e1").json()["my_state"] is None


# --------------------------------------------------------------------------
# Answering
# --------------------------------------------------------------------------


def test_answering_tallies_and_reports_back_your_own_answer(client, db) -> None:
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1), type="match")
    login(client, "regular", "1234")

    body = client.put("/api/events/e1/response", json={"state": "yes"}).json()

    assert body["counts"]["yes"] == 1
    assert body["my_state"] == "yes"
    # Eight members exist and one has answered.
    assert body["counts"]["unanswered"] == 7


def test_changing_your_mind_replaces_the_answer_rather_than_adding_one(client, db) -> None:
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1))
    login(client, "regular", "1234")

    client.put("/api/events/e1/response", json={"state": "yes"})
    body = client.put("/api/events/e1/response", json={"state": "no"}).json()

    assert (body["counts"]["yes"], body["counts"]["no"]) == (0, 1)
    assert db.query(EventResponse).filter_by(event_id="e1").count() == 1


def test_silence_and_ved_ikke_stay_different_things(client, db) -> None:
    """A blank cell in the old sheet was not the same as "Ved ikke". Clearing
    an answer has to return a player to silence, not to a shrug."""
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1))
    login(client, "regular", "1234")

    client.put("/api/events/e1/response", json={"state": "maybe"})
    after_maybe = client.get("/api/events/e1").json()
    client.delete("/api/events/e1/response/regular")
    after_clear = client.get("/api/events/e1").json()

    assert after_maybe["counts"]["maybe"] == 1
    assert after_clear["counts"]["maybe"] == 0
    assert after_clear["my_state"] is None
    assert "Regular Reg" in [p["name"] for p in after_clear["unanswered"]]


def test_you_cannot_answer_for_another_member(client, db) -> None:
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1))
    login(client, "regular", "1234")

    response = client.put("/api/events/e1/response/p1", json={"state": "yes"})

    assert response.status_code == 403


def test_anyone_may_answer_for_a_guest(client, db) -> None:
    """Somebody has to sign the guest up, and it is the person bringing them."""
    _seed(db)
    make_player(db, "guest-1", "Gæst Gæstesen", is_guest=True)
    make_event(db, "e1", "season-1", date(2099, 1, 1))
    login(client, "regular", "1234")

    body = client.put("/api/events/e1/response/guest-1", json={"state": "yes"}).json()

    assert body["counts"]["yes"] == 1
    written = db.query(EventResponse).filter_by(event_id="e1", player_id="guest-1").one()
    assert written.added_by == "regular"


def test_a_guest_is_never_chased_for_an_answer(client, db) -> None:
    """``unanswered`` is the members still to be heard from. Nobody asked the
    guest, so their silence is not an outstanding question."""
    _seed(db)
    make_player(db, "guest-1", "Gæst Gæstesen", is_guest=True)
    make_event(db, "e1", "season-1", date(2099, 1, 1))

    body = client.get("/api/events/e1").json()

    assert "Gæst Gæstesen" not in [p["name"] for p in body["unanswered"]]
    assert body["counts"]["unanswered"] == 8


def test_an_admin_may_answer_for_anyone(client, db) -> None:
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1))
    login(client, "boss", "9999")

    assert client.put("/api/events/e1/response/p1", json={"state": "yes"}).status_code == 200


def test_nobody_answers_a_cancelled_event(client, db) -> None:
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1), status="cancelled")
    login(client, "regular", "1234")

    response = client.put("/api/events/e1/response", json={"state": "yes"})

    assert response.status_code == 400
    assert response.json()["detail"] == "Begivenheden er aflyst."


def test_answering_needs_a_login(client, db) -> None:
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1))

    assert client.put("/api/events/e1/response", json={"state": "yes"}).status_code == 401


# --------------------------------------------------------------------------
# Selection is not availability
# --------------------------------------------------------------------------


def test_saying_klar_does_not_pick_you(client, db) -> None:
    """The one property this feature exists to keep true."""
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1), type="match")
    login(client, "regular", "1234")
    client.put("/api/events/e1/response", json={"state": "yes"})

    body = client.get("/api/events/e1").json()

    assert body["counts"]["yes"] == 1
    assert body["selected_count"] == 0
    assert body["selected"] == []


def test_being_picked_does_not_answer_for_you(client, db) -> None:
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1), type="match")
    login(client, "boss", "9999")

    client.put("/api/events/e1/selection", json={"player_ids": list(SQUAD)})
    body = client.get("/api/events/e1").json()

    assert body["selected_count"] == 6
    assert body["counts"]["yes"] == 0
    assert len(body["unanswered"]) == 8


def test_a_squad_is_replaced_wholesale_not_appended(client, db) -> None:
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1), type="match")
    login(client, "boss", "9999")

    client.put("/api/events/e1/selection", json={"player_ids": ["p1", "p2", "p3"]})
    body = client.put("/api/events/e1/selection", json={"player_ids": ["p4", "p5"]}).json()

    assert [p["id"] for p in body["selected"]] == ["p4", "p5"]


def test_picking_is_admin_only(client, db) -> None:
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1), type="match")
    login(client, "regular", "1234")

    assert client.put("/api/events/e1/selection", json={"player_ids": ["p1"]}).status_code == 403


# --------------------------------------------------------------------------
# The plan
# --------------------------------------------------------------------------


def test_a_plan_is_stored_as_rounds_and_courts(client, db) -> None:
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1))
    login(client, "boss", "9999")

    body = client.put(
        "/api/events/e1/matchups",
        json={
            "matchups": [
                {"round": 1, "court": 1, "team_a": ["p1", "p2"], "team_b": ["p3", "p4"]},
                {"round": 1, "court": 2, "team_a": ["p5", "p6"], "team_b": ["regular", "boss"]},
            ]
        },
    ).json()

    assert len(body["matchups"]) == 2
    assert [p["id"] for p in body["matchups"][0]["team_a"]] == ["p1", "p2"]


def test_a_plan_never_becomes_a_match(client, db) -> None:
    """The guardrail. Planning line-ups writes to ``event_matchups`` and to
    nothing else -- no ``Match``, no ``MatchSet``, no rating. Score entry is
    still the only thing in the app that can move the ladder."""
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1))
    login(client, "boss", "9999")
    before = client.get("/api/ladder?season=all").json()["entries"]

    client.put(
        "/api/events/e1/matchups",
        json={
            "matchups": [
                {"round": 1, "court": 1, "team_a": ["p1", "p2"], "team_b": ["p3", "p4"]}
            ]
        },
    )

    assert db.query(Match).count() == 0
    assert db.query(EventMatchup).count() == 1
    assert client.get("/api/ladder?season=all").json()["entries"] == before


def test_a_plan_is_replaced_wholesale(client, db) -> None:
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1))
    login(client, "boss", "9999")

    client.put(
        "/api/events/e1/matchups",
        json={
            "matchups": [
                {"round": 1, "court": 1, "team_a": ["p1", "p2"], "team_b": ["p3", "p4"]}
            ]
        },
    )
    body = client.put("/api/events/e1/matchups", json={"matchups": []}).json()

    assert body["matchups"] == []
    assert db.query(EventMatchup).count() == 0


# --------------------------------------------------------------------------
# Editing and cancelling
# --------------------------------------------------------------------------


def test_moving_a_training_to_two_courts(client, db) -> None:
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1))
    login(client, "boss", "9999")

    body = client.patch("/api/events/e1", json={"capacity": 8}).json()

    assert body["capacity"] == 8


def test_cancelling_keeps_the_event_and_its_answers(client, db) -> None:
    """"Aflyst" is information. A deleted row says nothing at all."""
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1))
    login(client, "regular", "1234")
    client.put("/api/events/e1/response", json={"state": "yes"})
    login(client, "boss", "9999")

    client.patch("/api/events/e1", json={"status": "cancelled"})
    body = client.get("/api/events/e1").json()

    assert body["status"] == "cancelled"
    assert body["counts"]["yes"] == 1


def test_re_dating_an_event_moves_it_to_the_right_season(client, db) -> None:
    _seed(db)
    make_season(db, ("Forår 2026", date(2026, 1, 12), date(2026, 3, 16)), "season-2")
    make_event(db, "e1", "season-1", date(2025, 9, 8))
    login(client, "boss", "9999")

    body = client.patch("/api/events/e1", json={"held_on": "2026-02-01"}).json()

    assert body["season"]["name"] == "Forår 2026"


def test_an_empty_note_clears_it(client, db) -> None:
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1), note="Husk bolde")
    login(client, "boss", "9999")

    assert client.patch("/api/events/e1", json={"note": "  "}).json()["note"] is None


def test_deleting_an_event_is_admin_only(client, db) -> None:
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1))
    login(client, "regular", "1234")

    assert client.delete("/api/events/e1").status_code == 403


def test_deleting_an_event_takes_its_answers_and_leaves_its_session(client, db) -> None:
    """A calendar entry can be deleted. The evening that was played, and the
    ratings it moved, never can be reached from here."""
    _seed(db)
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
    event = make_event(db, "e1", "season-1", date(2025, 9, 1))
    event.session_id = "s1"
    db.commit()
    before = client.get("/api/ladder?season=all").json()["entries"]
    login(client, "boss", "9999")

    assert client.delete("/api/events/e1").status_code == 204
    assert db.query(Event).count() == 0
    assert db.query(Match).count() == 1
    assert client.get("/api/ladder?season=all").json()["entries"] == before


# --------------------------------------------------------------------------
# The handover to score entry
# --------------------------------------------------------------------------


def test_a_training_opens_an_empty_session_and_links_to_it(client, db) -> None:
    _seed(db)
    make_event(db, "e1", "season-1", date(2025, 9, 7), note="Tre baner")
    login(client, "boss", "9999")

    created = client.post("/api/events/e1/session").json()
    event = client.get("/api/events/e1").json()

    assert created["played_on"] == "2025-09-07"
    assert created["type"] == "training"
    assert created["match_count"] == 0
    assert event["session_id"] == created["id"]


def test_a_fixture_never_opens_a_session(client, db) -> None:
    """A league match is against another club. There is no internal doubles
    result to type in and none of it belongs on the ladder."""
    _seed(db)
    make_event(db, "e1", "season-1", date(2025, 9, 8), type="match", opponent="Piverts")
    login(client, "boss", "9999")

    response = client.post("/api/events/e1/session")

    assert response.status_code == 400
    assert response.json()["detail"] == "Kun en træning kan blive til en session."


def test_a_training_only_opens_one_session(client, db) -> None:
    _seed(db)
    make_event(db, "e1", "season-1", date(2025, 9, 7))
    login(client, "boss", "9999")

    client.post("/api/events/e1/session")
    second = client.post("/api/events/e1/session")

    assert second.status_code == 400


def test_the_yes_list_is_what_prefills_the_line_up(client, db) -> None:
    """The service exposes who said yes so the entry screen can start from it.
    It is a starting point for a picker, never a claim that these four played."""
    _seed(db)
    make_event(db, "e1", "season-1", date(2025, 9, 7))
    login(client, "boss", "9999")
    for pid in ("p1", "p2", "p3"):
        client.put(f"/api/events/e1/response/{pid}", json={"state": "yes"})
    client.put("/api/events/e1/response/p4", json={"state": "no"})

    assert sorted(service.available_ids(db, "e1")) == ["p1", "p2", "p3"]


# --------------------------------------------------------------------------
# Guests
# --------------------------------------------------------------------------


def test_any_logged_in_player_can_add_a_guest(client, db) -> None:
    _seed(db)
    login(client, "regular", "1234")

    response = client.post("/api/players/guest", json={"name": "Bjarne Bolden"})

    assert response.status_code == 201
    body = response.json()
    assert body["is_guest"] is True
    assert body["entry_rating"] == SEED_RATING


def test_a_guest_gets_no_pin_and_cannot_log_in(client, db) -> None:
    _seed(db)
    login(client, "regular", "1234")

    guest = client.post("/api/players/guest", json={"name": "Bjarne Bolden"}).json()

    assert login(client, guest["id"], "1234").status_code == 401


def test_adding_a_guest_needs_a_login(client, db) -> None:
    _seed(db)

    assert client.post("/api/players/guest", json={"name": "Bjarne"}).status_code == 401


def test_the_same_guest_typed_twice_is_one_person(client, db) -> None:
    """Two people adding the same guest to the same Sunday is a collision of
    intent, not an error. A second row would split that guest's record."""
    _seed(db)
    login(client, "regular", "1234")

    first = client.post("/api/players/guest", json={"name": "Bjarne Bolden"}).json()
    second = client.post("/api/players/guest", json={"name": " Bjarne Bolden "}).json()

    assert first["id"] == second["id"]


def test_a_guest_route_cannot_mint_an_admin(client, db) -> None:
    """The reason this is its own route and not an opening-up of POST
    /players: everything it can create is harmless."""
    _seed(db)
    login(client, "regular", "1234")

    guest = client.post(
        "/api/players/guest",
        json={"name": "Bjarne Bolden", "is_admin": True, "entry_rating": 2000},
    ).json()

    assert guest["is_guest"] is True
    assert guest["entry_rating"] == SEED_RATING
    assert "is_admin" not in guest or guest.get("is_admin") is False


def test_adding_a_guest_moves_nobody_rating(client, db) -> None:
    """A guest affects ratings by playing, not by existing.

    They do appear on the guest-inclusive board straight away, with no matches
    and the seed rating -- that is how every unplayed player has always been
    listed. What must not happen is a number moving underneath somebody who
    has played.
    """
    _seed(db)
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

    def ratings() -> dict[str, float]:
        entries = client.get("/api/ladder?season=all&include_guests=true").json()["entries"]
        return {e["player_id"]: e["rating"] for e in entries if e["player_id"] in SQUAD}

    before = ratings()
    login(client, "regular", "1234")

    client.post("/api/players/guest", json={"name": "Bjarne Bolden"})

    assert ratings() == before


# --------------------------------------------------------------------------
# What the Sunday screen leans on
# --------------------------------------------------------------------------


def test_a_guest_found_by_search_joins_a_sunday_as_an_ordinary_yes(client, db) -> None:
    """Bringing somebody is not a third kind of attendance. The guest is a
    player row and being on the list is a yes-answer written on their behalf,
    which is why they land in the same tally as everybody else."""
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1))
    login(client, "regular", "1234")

    guest = client.post("/api/players/guest", json={"name": "Bjarne Bolden"}).json()
    body = client.put(f"/api/events/e1/response/{guest['id']}", json={"state": "yes"}).json()

    assert body["counts"]["yes"] == 1
    detail = client.get("/api/events/e1").json()
    assert [r["player"]["is_guest"] for r in detail["responses"]] == [True]


def test_the_detail_says_which_of_the_yeses_are_guests(client, db) -> None:
    """The meter splits the yeses into holdet and gæster, because four guests
    holding up a full Sunday is a different situation from twelve members. It
    counts them off ``responses``, so the flag has to be on every row."""
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1))
    make_player(db, "g1", "Gæst Gæstesen", is_guest=True)
    login(client, "boss", "9999")
    for pid in ("p1", "p2", "g1"):
        client.put(f"/api/events/e1/response/{pid}", json={"state": "yes"})

    detail = client.get("/api/events/e1").json()
    coming = [r["player"] for r in detail["responses"] if r["state"] == "yes"]

    assert detail["counts"]["yes"] == 3
    assert sum(1 for p in coming if p["is_guest"]) == 1


def test_a_guest_comes_off_the_list_the_same_way_they_went_on(client, db) -> None:
    """Removing is clearing the answer, and the member who brought them can do
    it without waiting for an admin."""
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1))
    make_player(db, "g1", "Gæst Gæstesen", is_guest=True)
    login(client, "regular", "1234")
    client.put("/api/events/e1/response/g1", json={"state": "yes"})

    body = client.delete("/api/events/e1/response/g1").json()

    assert body["counts"]["yes"] == 0
    assert client.get("/api/events/e1").json()["responses"] == []


def test_a_full_sunday_plans_three_courts_in_a_round(client, db) -> None:
    """Twelve people on three baner is the plan the planner is shaped around:
    every court in the round is a different four, and the next round moves
    everybody. The API takes it in one write."""
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1))
    for pid in ("p7", "p8", "p9", "p10"):
        make_player(db, pid)
    login(client, "boss", "9999")

    body = client.put(
        "/api/events/e1/matchups",
        json={
            "matchups": [
                {"round": 1, "court": 1, "team_a": ["p1", "p2"], "team_b": ["p3", "p4"]},
                {"round": 1, "court": 2, "team_a": ["p5", "p6"], "team_b": ["p7", "p8"]},
                {"round": 1, "court": 3, "team_a": ["p9", "p10"], "team_b": ["regular", "boss"]},
                {"round": 2, "court": 1, "team_a": ["p1", "p3"], "team_b": ["p5", "p7"]},
            ]
        },
    ).json()

    assert len(body["matchups"]) == 4
    assert [m["round"] for m in body["matchups"]] == [1, 1, 1, 2]


def test_a_guest_stands_on_the_whiteboard_like_anybody_else(client, db) -> None:
    """A Sunday is filled with whoever turned up. The plan makes no distinction
    between a member and a guest, and neither does the screen."""
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1))
    make_player(db, "g1", "Gæst Gæstesen", is_guest=True)
    login(client, "boss", "9999")

    body = client.put(
        "/api/events/e1/matchups",
        json={
            "matchups": [
                {"round": 1, "court": 1, "team_a": ["p1", "g1"], "team_b": ["p3", "p4"]}
            ]
        },
    ).json()

    assert [p["id"] for p in body["matchups"][0]["team_a"]] == ["p1", "g1"]
    assert db.query(Match).count() == 0


# --------------------------------------------------------------------------
# What the fixture screen reads
# --------------------------------------------------------------------------


def test_a_picked_player_who_never_answered_is_still_being_chased(client, db) -> None:
    """The team sheet writes "Intet svar" next to that name and the "mangler
    svar" list keeps it. Being picked is not an answer, so it cannot quietly
    close a question somebody still has to go and ask."""
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1), type="match")
    login(client, "boss", "9999")

    client.put("/api/events/e1/selection", json={"player_ids": ["p1"]})
    body = client.get("/api/events/e1").json()

    assert [p["id"] for p in body["selected"]] == ["p1"]
    assert "p1" in [p["id"] for p in body["unanswered"]]
    assert body["counts"]["unanswered"] == 8


def test_picking_somebody_who_said_ikke_klar_leaves_the_no_standing(client, db) -> None:
    """An admin may pick a player who said no -- half this team says yes in the
    group chat and never opens the app. The screen flags that rather than
    hiding it, which only works because the no survives the pick."""
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1), type="match")
    login(client, "regular", "1234")
    client.put("/api/events/e1/response", json={"state": "no"})
    login(client, "boss", "9999")

    client.put("/api/events/e1/selection", json={"player_ids": ["regular"]})
    body = client.get("/api/events/e1").json()

    answers = {row["player"]["id"]: row["state"] for row in body["responses"]}
    assert answers["regular"] == "no"
    assert body["counts"]["no"] == 1
    assert body["counts"]["yes"] == 0
    assert [p["id"] for p in body["selected"]] == ["regular"]


def test_klar_and_udtaget_are_two_lists_that_only_happen_to_overlap(client, db) -> None:
    """Four klar, two of them picked, and one picked who said nothing. The
    reserves the screen shows are the klar names that are not in the squad --
    worked out on the way to the pixels, never stored and never inferred back."""
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1), type="match")
    for pid in ("p1", "p2", "p3", "p4"):
        service.set_response(db, "e1", pid, "yes")
    login(client, "boss", "9999")

    client.put("/api/events/e1/selection", json={"player_ids": ["p1", "p2", "p5"]})
    body = client.get("/api/events/e1").json()

    klar = {row["player"]["id"] for row in body["responses"] if row["state"] == "yes"}
    squad = {p["id"] for p in body["selected"]}
    assert klar == {"p1", "p2", "p3", "p4"}
    assert squad == {"p1", "p2", "p5"}
    assert klar - squad == {"p3", "p4"}


def test_a_squad_may_be_larger_than_the_number_of_places(client, db) -> None:
    """Seven picked for six places is something an admin does on the way to
    deciding. The sheet says so in words; it does not refuse the write and
    lose the other six."""
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1), type="match")
    login(client, "boss", "9999")

    body = client.put(
        "/api/events/e1/selection",
        json={"player_ids": [*SQUAD, "regular"]},
    ).json()

    assert body["capacity"] == 6
    assert body["selected_count"] == 7


def test_a_locked_fixture_still_takes_a_corrected_squad(client, db) -> None:
    """Låst points at the answers, not at the person who locked it. An admin
    who spots a wrong name on a finished team sheet fixes it in place."""
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1), type="match")
    login(client, "boss", "9999")
    client.put("/api/events/e1/selection", json={"player_ids": ["p1", "p2"]})

    client.patch("/api/events/e1", json={"status": "locked"})
    body = client.put("/api/events/e1/selection", json={"player_ids": ["p1", "p3"]}).json()

    assert body["status"] == "locked"
    assert [p["id"] for p in body["selected"]] == ["p1", "p3"]


def test_an_aflyst_fixture_takes_no_squad_at_all(client, db) -> None:
    """Why "Sæt holdet" is dead on a cancelled fixture instead of failing once
    it has been pressed."""
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1), type="match", status="cancelled")
    login(client, "boss", "9999")

    response = client.put("/api/events/e1/selection", json={"player_ids": ["p1"]})

    assert response.status_code == 400


def test_deleting_a_fixture_takes_the_squad_with_it(client, db) -> None:
    """Nothing is left pointing at a date that no longer exists."""
    from rammeslag.modules.events.models import EventSelection

    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1), type="match")
    login(client, "boss", "9999")
    client.put("/api/events/e1/selection", json={"player_ids": list(SQUAD)})

    assert client.delete("/api/events/e1").status_code == 204
    assert db.query(EventSelection).count() == 0


def test_setting_a_squad_never_reaches_a_rating(client, db) -> None:
    """Picking six for a Saturday against another club is not a match, and
    there is nothing on this screen that could turn it into one."""
    _seed(db)
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
    make_event(db, "e1", "season-1", date(2099, 1, 1), type="match")
    before = client.get("/api/ladder?season=all").json()["entries"]
    login(client, "boss", "9999")

    client.put("/api/events/e1/selection", json={"player_ids": list(SQUAD)})
    client.patch("/api/events/e1", json={"status": "locked"})

    assert db.query(Match).count() == 1
    assert client.get("/api/ladder?season=all").json()["entries"] == before


# --------------------------------------------------------------------------
# Rewriting a whole list
# --------------------------------------------------------------------------


def test_replanning_the_same_round_and_court_is_not_a_collision(client, db) -> None:
    """The ordinary edit: swap two players, keep round 1 on court 1.

    Replacing a list wholesale deletes the old rows and inserts the new ones,
    and SQLAlchemy emits inserts before deletes inside one flush -- so without
    an explicit flush between the two halves this lands on
    UNIQUE(event_id, round, court) and 500s. Every real replan reuses a slot,
    so only a test that keeps one could catch it.
    """
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1))
    login(client, "boss", "9999")

    first = {
        "matchups": [{"round": 1, "court": 1, "team_a": ["p1", "p2"], "team_b": ["p3", "p4"]}]
    }
    second = {
        "matchups": [{"round": 1, "court": 1, "team_a": ["p1", "p3"], "team_b": ["p2", "p4"]}]
    }
    client.put("/api/events/e1/matchups", json=first)
    response = client.put("/api/events/e1/matchups", json=second)

    assert response.status_code == 200
    assert [p["id"] for p in response.json()["matchups"][0]["team_a"]] == ["p1", "p3"]
    assert db.query(EventMatchup).count() == 1


# --------------------------------------------------------------------------
# Locking
# --------------------------------------------------------------------------


def test_a_locked_fixture_refuses_a_players_answer(client, db) -> None:
    """Locking is what stops an answer moving under a finished team sheet. A
    disabled button is not that rule; this is."""
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1), type="match", status="locked")
    login(client, "regular", "1234")

    response = client.put("/api/events/e1/response", json={"state": "no"})

    assert response.status_code == 400
    assert "låst" in response.json()["detail"].lower()


def test_an_admin_still_records_a_late_withdrawal_on_a_locked_fixture(client, db) -> None:
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1), type="match", status="locked")
    login(client, "boss", "9999")

    assert client.put("/api/events/e1/response/p1", json={"state": "no"}).status_code == 200


def test_locking_does_not_freeze_the_squad_itself(client, db) -> None:
    """Locked means the answers are settled, not that the admin is finished."""
    _seed(db)
    make_event(db, "e1", "season-1", date(2099, 1, 1), type="match", status="locked")
    login(client, "boss", "9999")

    response = client.put("/api/events/e1/selection", json={"player_ids": ["p1", "p2"]})

    assert response.status_code == 200
