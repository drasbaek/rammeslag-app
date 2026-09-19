"""Ladder logic.

Almost everything here is pure: rows in, ranking out, no database. The HTTP
tests at the bottom check that the route serialises the same list.

The rules under test are docs/RATING.md, "Who appears on the ladder":
members only unless guests are asked for, no activity filter, everyone ranked
1..n, and provisional players keep their rank.
"""

from __future__ import annotations

import datetime as dt
from datetime import date

import pytest

from rammeslag.modules.matches.service import day_bounds, rank_by, replay_rows
from rammeslag.modules.players.service import PlayerInfo, build_ladder
from rammeslag.modules.rating.constants import PROVISIONAL_MATCHES, SEED_RATING
from tests.conftest import (
    EFTERAAR,
    FORAAR,
    make_match,
    make_player,
    make_season,
    make_session,
    row,
)

REGULARS = ["p1", "p2", "p3", "p4"]
GUEST = "guest"
SPRING = dt.datetime(2026, 2, 1, 18, 0, tzinfo=dt.UTC)


def _players(*guests: str, **members: float) -> dict[str, PlayerInfo]:
    """The four regulars as members, plus any named guests and extra members.

    ``members`` maps an extra member's id to their entry rating, which is how
    a player who has never played still has a place on the ladder.
    """
    people = {pid: PlayerInfo(id=pid, name=pid.upper()) for pid in REGULARS}
    for pid in guests:
        people[pid] = PlayerInfo(id=pid, name=pid.upper(), is_guest=True)
    for pid, entry_rating in members.items():
        people[pid] = PlayerInfo(id=pid, name=pid.upper(), entry_rating=entry_rating)
    return people


# Partners rotate, so nobody ends up with a bit-identical rating and the
# ranks are genuinely distinct.
ROTATION = [
    (("p1", "p2"), ("p3", "p4"), [(6, 2)]),
    (("p1", "p3"), ("p2", "p4"), [(6, 2)]),
    (("p1", "p4"), ("p2", "p3"), [(6, 3)]),
    (("p1", "p2"), ("p3", "p4"), [(6, 4)]),
    (("p1", "p3"), ("p2", "p4"), [(6, 1)]),
]


def _six_matches() -> list:
    """Five matches for the regulars, then one that introduces a guest."""
    rows = [
        row(f"m{i}", "s1", i * 10, team_a, team_b, sets)
        for i, (team_a, team_b, sets) in enumerate(ROTATION, start=1)
    ]
    rows.append(row("m6", "s2", 10_000, ("p1", GUEST), ("p3", "p4"), [(6, 3)]))
    return rows


def _ladder(rows, players, **kwargs):
    """Replay and rank, seeding from the players' entry ratings like the service does."""
    entry = {pid: info.entry_rating for pid, info in players.items()}
    return build_ladder(rows, replay_rows(rows, entry), players, **kwargs)


def test_threshold_is_the_engine_constant_not_a_literal() -> None:
    rows = _six_matches()
    ladder = _ladder(rows, _players(GUEST))
    assert ladder.threshold == PROVISIONAL_MATCHES


def test_the_only_filter_is_is_guest() -> None:
    rows = _six_matches()
    members_only = _ladder(rows, _players(GUEST))
    with_guests = _ladder(rows, _players(GUEST), include_guests=True)

    assert [e.player_id for e in members_only.entries] != []
    assert GUEST not in {e.player_id for e in members_only.entries}
    assert GUEST in {e.player_id for e in with_guests.entries}
    assert members_only.includes_guests is False
    assert with_guests.includes_guests is True
    # The toggle can say what it would add.
    assert members_only.guest_count == 1
    assert with_guests.guest_count == 0


def test_provisional_players_are_flagged_but_keep_their_rank() -> None:
    rows = _six_matches()
    ladder = _ladder(rows, _players(GUEST), include_guests=True)
    by_id = {e.player_id: e for e in ladder.entries}

    guest = by_id[GUEST]
    assert guest.career_matches == 1
    assert guest.provisional is True
    # Ranked all the same. One match is a small sample, not an absence.
    assert guest.rank in {e.rank for e in ladder.entries}
    assert guest.rank >= 1

    assert all(by_id[pid].provisional is False for pid in REGULARS)


def test_ranks_run_from_one_over_everyone_shown() -> None:
    rows = _six_matches()
    ladder = _ladder(rows, _players(GUEST), include_guests=True)
    ranks = [e.rank for e in ladder.entries]
    assert len(ladder.entries) == 5
    assert ranks == [1, 2, 3, 4, 5]


def test_a_member_who_never_played_is_still_on_the_ladder() -> None:
    """No activity filter. Someone who missed everything sits at their entry rating."""
    rows = _six_matches()
    ladder = _ladder(rows, _players(GUEST, sofa=1000.0))
    by_id = {e.player_id: e for e in ladder.entries}

    assert "sofa" in by_id
    assert by_id["sofa"].career_matches == 0
    assert by_id["sofa"].matches_played == 0
    assert by_id["sofa"].rating == pytest.approx(SEED_RATING)
    assert by_id["sofa"].rating_gained == pytest.approx(0.0)
    assert by_id["sofa"].provisional is True
    assert by_id["sofa"].form == []


def test_a_member_who_missed_the_season_is_absent_from_that_season_board() -> None:
    """docs/RATING.md: a season standing covers only players who played that
    season. The no-activity-filter rule governs the all-time ladder; a member
    who did not play has no season performance, and listing them on 0.0 gain
    would rank them above everyone who turned up and lost."""
    autumn = [
        row(f"a{i}", "sa", i * 10, ("p1", "p2"), ("p3", "p4"), [(6, 1)]) for i in range(1, 6)
    ]
    spring = [
        row(f"b{i}", "sb", i * 10, ("p1", "p2"), ("p3", GUEST), [(6, 1)], base=SPRING)
        for i in range(1, 6)
    ]
    rows = autumn + spring
    spring_ladder = _ladder(rows, _players(GUEST), window=day_bounds(*FORAAR[1:]))
    by_id = {e.player_id: e for e in spring_ladder.entries}

    # p4 only played in the autumn, so they are not on the spring board.
    assert "p4" not in by_id
    # ...but they are still on the all-time ladder, which never resets.
    all_time = _ladder(rows, _players(GUEST))
    assert "p4" in {e.player_id for e in all_time.entries}
    # The guest played all spring and is still hidden by default.
    assert GUEST not in by_id


def test_entry_ratings_seed_the_ladder() -> None:
    """A newcomer an admin rates at 1200 does not enter as a 1000-rated player."""
    rows = _six_matches()
    ladder = _ladder(rows, _players(GUEST, newcomer=1200.0))
    by_id = {e.player_id: e for e in ladder.entries}
    # Never played, so the rating is exactly what the admin set -- and that is
    # enough to top an all-time ladder.
    assert by_id["newcomer"].rating == pytest.approx(1200.0)
    assert by_id["newcomer"].rank == 1


def test_guest_matches_still_feed_the_replay() -> None:
    """The filter is presentation only. It must never change what compute() sees."""
    rows = _six_matches()
    without_guest_rows = [r for r in rows if GUEST not in r.player_ids]

    with_guest = {e.player_id: e.rating for e in _ladder(rows, _players(GUEST)).entries}
    without_guest = {
        e.player_id: e.rating
        for e in _ladder(without_guest_rows, _players(GUEST)).entries
    }
    # p3 lost to the guest's team, so dropping that match changes their rating.
    assert with_guest["p3"] != without_guest["p3"]
    # And hiding the guest from the list changes nothing at all.
    shown = {e.player_id: e.rating for e in _ladder(rows, _players(GUEST)).entries}
    hidden = {
        e.player_id: e.rating
        for e in _ladder(rows, _players(GUEST), include_guests=True).entries
        if e.player_id != GUEST
    }
    assert shown == hidden


def test_all_time_ranks_by_absolute_rating() -> None:
    rows = _six_matches()
    ladder = _ladder(rows, _players(GUEST))
    ratings = [e.rating for e in ladder.entries]
    assert ratings == sorted(ratings, reverse=True)
    assert ladder.entries[0].player_id == "p1"


def test_season_mode_ranks_by_rating_gained_inside_the_window() -> None:
    """A player can lead the season while sitting below someone on all-time."""
    autumn = [
        row(f"a{i}", "sa", i * 10, ("p1", "p2"), ("p3", "p4"), [(6, 1)]) for i in range(1, 6)
    ]
    # Spring: the previous losers win everything, so they gain the most.
    spring = [
        row(f"b{i}", "sb", i * 10, ("p3", "p4"), ("p1", "p2"), [(6, 1)], base=SPRING)
        for i in range(1, 4)
    ]
    rows = autumn + spring
    view = replay_rows(rows)
    window = day_bounds(date(2026, 1, 12), date(2026, 3, 16))

    season = build_ladder(rows, view, _players(), window=window)
    all_time = build_ladder(rows, view, _players())

    assert {e.player_id for e in season.entries[:2]} == {"p3", "p4"}
    assert {e.player_id for e in all_time.entries[:2]} == {"p1", "p2"}
    assert all(e.rating_gained > 0 for e in season.entries[:2])


def test_movement_is_measured_against_the_previous_session() -> None:
    rows = [
        row(f"m{i}", "s1", i * 10, ("p1", "p2"), ("p3", "p4"), [(6, 5)]) for i in range(1, 6)
    ]
    # A later session where the trailing pair thrashes the leaders and flips
    # the top of the ladder.
    rows += [
        row(f"n{i}", "s2", 1_000 + i * 10, ("p3", "p4"), ("p1", "p2"), [(6, 0)])
        for i in range(1, 5)
    ]
    ladder = _ladder(rows, _players())
    by_id = {e.player_id: e for e in ladder.entries}

    assert by_id["p3"].previous_rank is not None
    assert by_id["p3"].movement == by_id["p3"].previous_rank - by_id["p3"].rank
    # They were behind and are now ahead: movement is positive.
    assert by_id["p3"].movement > 0
    assert by_id["p1"].movement < 0


def test_form_is_the_last_five_verdicts() -> None:
    rows = [
        row(f"m{i}", "s1", i * 10, ("p1", "p2"), ("p3", "p4"), [(6, 1)]) for i in range(1, 6)
    ]
    rows.append(row("m6", "s1", 100, ("p1", "p2"), ("p3", "p4"), [(3, 3)]))
    rows.append(row("m7", "s1", 110, ("p3", "p4"), ("p1", "p2"), [(6, 0)]))
    ladder = _ladder(rows, _players())
    by_id = {e.player_id: e for e in ladder.entries}
    assert by_id["p1"].form == ["W", "W", "W", "D", "L"]
    assert by_id["p3"].form == ["L", "L", "L", "D", "W"]


def test_active_is_a_display_flag_not_a_filter() -> None:
    rows = _six_matches()
    ladder = _ladder(rows, _players(GUEST), active_ids={"p1", "p2"})
    by_id = {e.player_id: e for e in ladder.entries}
    assert by_id["p1"].active is True
    assert by_id["p3"].active is False
    # Inactive, and still on the ladder.
    assert set(by_id) == set(REGULARS)


def test_rank_by_shares_a_rank_and_leaves_a_gap() -> None:
    ranks = rank_by({"a": 10.0, "b": 10.0, "c": 5.0}, {"a": "A", "b": "B", "c": "C"})
    assert ranks == {"a": 1, "b": 1, "c": 3}


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------


def _seed_ladder(db) -> None:
    make_season(db, EFTERAAR, "season-1")
    for pid in REGULARS:
        make_player(db, pid)
    make_player(db, GUEST, is_guest=True)
    make_session(db, "s1", "season-1", date(2025, 9, 1))
    for i, (team_a, team_b, sets) in enumerate(ROTATION, start=1):
        make_match(
            db, f"m{i}", "s1", dt.datetime(2025, 9, 1, 18, i, tzinfo=dt.UTC), team_a, team_b, sets
        )
    make_match(
        db,
        "m6",
        "s1",
        dt.datetime(2025, 9, 1, 19, 0, tzinfo=dt.UTC),
        ("p1", GUEST),
        ("p3", "p4"),
        [(6, 3)],
    )


@pytest.mark.parametrize("season_param", ["all", None])
def test_ladder_endpoint_shows_members_ranked_from_one(client, db, season_param) -> None:
    _seed_ladder(db)
    url = "/api/ladder" if season_param is None else f"/api/ladder?season={season_param}"
    body = client.get(url).json()

    assert body["threshold"] == PROVISIONAL_MATCHES
    assert body["includes_guests"] is False
    assert body["guest_count"] == 1
    assert [e["player_id"] for e in body["entries"]] != []
    assert GUEST not in {e["player_id"] for e in body["entries"]}
    assert [e["rank"] for e in body["entries"]] == [1, 2, 3, 4]


def test_ladder_endpoint_includes_guests_on_request(client, db) -> None:
    _seed_ladder(db)
    body = client.get("/api/ladder?include_guests=true").json()

    assert body["includes_guests"] is True
    assert body["guest_count"] == 0
    assert [e["rank"] for e in body["entries"]] == [1, 2, 3, 4, 5]

    guest = next(e for e in body["entries"] if e["player_id"] == GUEST)
    assert guest["provisional"] is True
    assert guest["rank"] >= 1


def test_ladder_endpoint_ratings_do_not_depend_on_the_filter(client, db) -> None:
    _seed_ladder(db)
    members = {
        e["player_id"]: e["rating"] for e in client.get("/api/ladder").json()["entries"]
    }
    everyone = {
        e["player_id"]: e["rating"]
        for e in client.get("/api/ladder?include_guests=true").json()["entries"]
        if e["player_id"] != GUEST
    }
    assert members == everyone


def test_ladder_endpoint_honours_entry_ratings(client, db) -> None:
    _seed_ladder(db)
    make_player(db, "newcomer", "Newcomer", entry_rating=1300.0)
    # All-time, because season mode ranks by gain and a newcomer has gained nothing.
    body = client.get("/api/ladder?season=all").json()
    top = body["entries"][0]
    assert top["player_id"] == "newcomer"
    assert top["rating"] == pytest.approx(1300.0)
    assert top["provisional"] is True


def test_unknown_season_is_a_danish_404(client, db) -> None:
    _seed_ladder(db)
    response = client.get("/api/ladder?season=season-nope")
    assert response.status_code == 404
    assert response.json()["detail"] == "Sæsonen findes ikke."


def test_career_record_ignores_the_season_scope() -> None:
    """The row shows an all-time W-L-D. A season's 2-1-0 says much less about a
    player than 31-15-3 does, so the career figures must survive season mode."""
    autumn = [
        row(f"a{i}", "sa", i * 10, ("p1", "p2"), ("p3", "p4"), [(6, 1)]) for i in range(1, 6)
    ]
    spring = [
        row(f"b{i}", "sb", i * 10, ("p1", "p2"), ("p3", "p4"), [(1, 6)], base=SPRING)
        for i in range(1, 3)
    ]
    rows = autumn + spring
    players = _players()

    all_time = {e.player_id: e for e in _ladder(rows, players).entries}
    season = {
        e.player_id: e
        for e in _ladder(rows, players, window=day_bounds(*FORAAR[1:])).entries
    }

    # p1 won all five autumn matches and lost both spring ones.
    assert (all_time["p1"].wins, all_time["p1"].losses) == (5, 2)
    # In season mode the scoped record is spring only...
    assert (season["p1"].wins, season["p1"].losses) == (0, 2)
    # ...but the career record is the whole thing, in both modes.
    assert (season["p1"].career_wins, season["p1"].career_losses) == (5, 2)
    assert (all_time["p1"].career_wins, all_time["p1"].career_losses) == (5, 2)
