"""scripts/import_history.py, driven with the pseudonymised fixture.

A human runs the real thing against ``export/padel_history.json``; no agent
ever does. ``fixtures/history.json`` has the identical structure with invented
names, so the grouping, the overrides and the idempotence are all testable
here without a real name going anywhere near the test suite.
"""

from __future__ import annotations

import importlib
import json
import sys
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session as DbSession
from sqlalchemy.orm import sessionmaker

from rammeslag.modules.matches.models import Match, MatchSet
from rammeslag.modules.players.models import Player
from rammeslag.modules.seasons.models import Season
from rammeslag.modules.sessions.models import Session as PlaySession

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = REPO_ROOT / "fixtures" / "history.json"
SCRIPT = REPO_ROOT / "scripts" / "import_history.py"

# The two seasons the history falls into, and the 16 dates it was played on.
SEASON_NAMES = {"Efterår 2025", "Forår 2026"}
SESSION_DATES = 16
MATCHES = 98
PLAYERS = 28


def _load_script():
    """Import the script by name. It lives outside the package on purpose."""
    if str(REPO_ROOT / "scripts") not in sys.path:
        sys.path.insert(0, str(REPO_ROOT / "scripts"))
    return importlib.import_module("import_history")


@pytest.fixture
def script():
    return _load_script()


@pytest.fixture
def history() -> dict:
    if not FIXTURE.is_file():
        pytest.skip("fixtures/history.json is missing")
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def _session_factory(engine: Engine):
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def _overrides(script, tmp_path: Path, payload: dict) -> object:
    path = tmp_path / "player_overrides.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return script.read_overrides(path)


def _run(script, engine: Engine, history: dict, overrides) -> object:
    with _session_factory(engine)() as db:
        counters = script.run_import(db, history, overrides)
        db.commit()
    return counters


def _default_overrides(script) -> object:
    return script.read_overrides(Path("/nonexistent/player_overrides.json"))


# --------------------------------------------------------------------------
# Grouping
# --------------------------------------------------------------------------


def test_the_history_lands_in_two_seasons_and_sixteen_sessions(
    script, engine, db: DbSession, history
) -> None:
    _run(script, engine, history, _default_overrides(script))

    seasons = db.execute(select(Season)).scalars().all()
    assert {s.name for s in seasons} == SEASON_NAMES
    autumn = next(s for s in seasons if s.name == "Efterår 2025")
    spring = next(s for s in seasons if s.name == "Forår 2026")
    assert (autumn.starts_on, autumn.ends_on) == (date(2025, 8, 25), date(2025, 11, 16))
    assert (spring.starts_on, spring.ends_on) == (date(2026, 1, 12), date(2026, 3, 16))

    sessions = db.execute(select(PlaySession)).scalars().all()
    assert len(sessions) == SESSION_DATES
    # One session per calendar date, each inside the season that covers it.
    assert len({s.played_on for s in sessions}) == SESSION_DATES
    by_id = {s.id: s for s in seasons}
    for play_session in sessions:
        season = by_id[play_session.season_id]
        assert season.starts_on <= play_session.played_on <= season.ends_on

    assert db.execute(select(func.count(Match.id))).scalar_one() == MATCHES
    assert db.execute(select(func.count(Player.id))).scalar_one() == PLAYERS
    # Every match belongs to the session for the date it was played on.
    dates = {s.id: s.played_on for s in sessions}
    for match in db.execute(select(Match)).scalars().unique().all():
        assert match.played_at.date() == dates[match.session_id]


def test_every_set_is_carried_over(script, engine, db: DbSession, history) -> None:
    _run(script, engine, history, _default_overrides(script))
    expected = sum(len(m["sets"]) for m in history["matches"])
    assert db.execute(select(func.count(MatchSet.id))).scalar_one() == expected


# --------------------------------------------------------------------------
# Overrides
# --------------------------------------------------------------------------


def test_every_player_gets_the_default_entry_rating(
    script, engine, db: DbSession, history
) -> None:
    """entry_rating is NOT NULL with no server default, so nobody may be missed."""
    _run(script, engine, history, _default_overrides(script))
    ratings = db.execute(select(Player.entry_rating)).scalars().all()
    assert len(ratings) == PLAYERS
    assert set(ratings) == {1000.0}


def test_overrides_set_entry_ratings_and_promote_guests(
    script, engine, db: DbSession, history, tmp_path
) -> None:
    named = history["players"][0]["name"]
    guest = next(p for p in history["players"] if p["is_guest"])

    overrides = _overrides(
        script,
        tmp_path,
        {
            "_default_entry_rating": 1000,
            "entry_ratings": {named: 1100},
            "promoted_to_member": [guest["name"]],
        },
    )
    counters = _run(script, engine, history, overrides)

    assert db.get(Player, history["players"][0]["id"]).entry_rating == 1100.0
    assert db.get(Player, guest["id"]).is_guest is False
    assert counters.data["entry_ratings_overridden"] == 1
    assert counters.data["promoted_to_member"] == 1
    # Everyone else took the default.
    others = db.execute(
        select(Player.entry_rating).where(Player.id != history["players"][0]["id"])
    ).scalars().all()
    assert set(others) == {1000.0}


def test_a_non_default_default_applies_to_everyone(
    script, engine, db: DbSession, history, tmp_path
) -> None:
    overrides = _overrides(
        script, tmp_path, {"_default_entry_rating": 950, "entry_ratings": {}}
    )
    _run(script, engine, history, overrides)
    assert set(db.execute(select(Player.entry_rating)).scalars().all()) == {950.0}


def test_an_override_naming_nobody_is_a_refusal(
    script, engine, history, tmp_path
) -> None:
    """A typo in a real name would silently leave that player on the default."""
    overrides = _overrides(
        script, tmp_path, {"entry_ratings": {"Ingen Sådan Spiller": 1200}}
    )
    with pytest.raises(SystemExit, match="names nobody in the export"):
        _run(script, engine, history, overrides)


# --------------------------------------------------------------------------
# Idempotence and the --confirm gate
# --------------------------------------------------------------------------


def test_running_twice_changes_nothing(script, engine, db: DbSession, history) -> None:
    first = _run(script, engine, history, _default_overrides(script))
    assert first.data["players_created"] == PLAYERS
    assert first.data["matches_created"] == MATCHES
    assert first.data["sessions_created"] == SESSION_DATES

    second = _run(script, engine, history, _default_overrides(script))
    assert second.data["players_created"] == 0
    assert second.data["matches_created"] == 0
    assert second.data["sessions_created"] == 0
    assert second.data["players_unchanged"] == PLAYERS
    assert second.data["matches_unchanged"] == MATCHES

    assert db.execute(select(func.count(Match.id))).scalar_one() == MATCHES
    assert db.execute(select(func.count(Player.id))).scalar_one() == PLAYERS


def test_a_second_run_applies_an_edited_override(
    script, engine, db: DbSession, history, tmp_path
) -> None:
    """Correcting an entry rating is done by editing the file and re-running."""
    _run(script, engine, history, _default_overrides(script))
    named = history["players"][0]["name"]
    overrides = _overrides(
        script, tmp_path, {"_default_entry_rating": 1000, "entry_ratings": {named: 1100}}
    )
    counters = _run(script, engine, history, overrides)

    assert db.get(Player, history["players"][0]["id"]).entry_rating == 1100.0
    assert counters.data["players_updated"] == 1


def test_it_refuses_to_run_without_confirm(script) -> None:
    with pytest.raises(SystemExit) as raised:
        script.main(["--file", str(FIXTURE), "--database-url", "sqlite://"])
    assert raised.value.code != 0
