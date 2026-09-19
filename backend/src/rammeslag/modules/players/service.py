"""Player logic: credentials, the ladder, and the profile read model.

The interesting parts (`build_ladder`, `build_profile`) are pure functions over
plain rows, so they are unit-testable without a database. No FastAPI imports.
"""

from __future__ import annotations

import secrets
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime

import bcrypt
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from rammeslag.db import new_id
from rammeslag.modules.matches import service as match_service
from rammeslag.modules.matches.service import (
    DRAW,
    LOSS,
    WIN,
    DomainError,
    MatchRow,
    NotFoundError,
    ReplayView,
    day_bounds,
    form_for,
    internal_rows,
    player_verdict,
    players_in,
    rank_by,
    record_for,
    rows_within,
)
from rammeslag.modules.players.models import ID_PREFIX as PLAYER_ID_PREFIX
from rammeslag.modules.players.models import Player
from rammeslag.modules.rating.constants import PROVISIONAL_MATCHES, SEED_RATING
from rammeslag.modules.seasons import service as season_service
from rammeslag.modules.seasons.models import Season

# A highlight ("bedste makker") needs at least this many matches behind it.
# Every stat still ships its sample size; this only decides what gets a badge.
MIN_HIGHLIGHT_SAMPLE = 2

BAD_CREDENTIALS = "Forkert spiller eller pinkode."
NO_PIN = "Den spiller har ingen pinkode endnu."


# --------------------------------------------------------------------------
# Credentials
# --------------------------------------------------------------------------


def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_pin(pin: str, pin_hash: str | None) -> bool:
    if not pin_hash:
        return False
    try:
        return bcrypt.checkpw(pin.encode("utf-8"), pin_hash.encode("utf-8"))
    except ValueError:
        return False


def authenticate(db: DbSession, player_id: str, pin: str) -> Player:
    """Verify a pin. Same error for unknown player and wrong pin, on purpose."""
    player = db.get(Player, player_id)
    if player is None or not player.pin_hash:
        # Burn roughly the same time as a real check so the response does not
        # leak which player ids exist.
        bcrypt.checkpw(b"x", bcrypt.hashpw(secrets.token_bytes(8), bcrypt.gensalt()))
        raise DomainError(BAD_CREDENTIALS, status_code=401)
    if not verify_pin(pin, player.pin_hash):
        raise DomainError(BAD_CREDENTIALS, status_code=401)
    return player


# --------------------------------------------------------------------------
# Plain types
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class PlayerInfo:
    id: str
    name: str
    is_guest: bool = False
    entry_rating: float = SEED_RATING


@dataclass
class LadderEntry:
    rank: int
    player_id: str
    name: str
    is_guest: bool
    rating: float
    rating_gained: float
    # Matches inside the current scope (season, or everything for all-time).
    matches_played: int
    # Career total across every season. This is what the provisional threshold
    # is measured against, so the UI can explain why someone is unranked.
    career_matches: int
    wins: int
    losses: int
    draws: int
    form: list[str]
    active: bool
    # Fewer than PROVISIONAL_MATCHES career matches: ranked, but the rating is
    # still settling. Same constant the engine uses to pick K -- one concept.
    provisional: bool = False
    previous_rank: int | None = None
    movement: int | None = None


@dataclass
class Ladder:
    """One ranked list, 1..n.

    Members only unless the caller asks for guests: members are the team, and
    the ladder is theirs. Guests still affect every rating in the replay --
    they are simply not who the ranking is for. Nothing else is filtered out:
    no activity rule, no minimum number of matches.
    """

    entries: list[LadderEntry] = field(default_factory=list)
    threshold: int = PROVISIONAL_MATCHES
    includes_guests: bool = False
    # Guests left out of ``entries``, so the toggle can say what it would add.
    guest_count: int = 0


@dataclass
class PairStat:
    player_id: str
    name: str
    matches: int
    wins: int
    losses: int
    draws: int

    @property
    def win_rate(self) -> float:
        return self.wins / self.matches if self.matches else 0.0


@dataclass
class SeasonStat:
    season_id: str
    name: str
    matches: int
    wins: int
    losses: int
    draws: int
    rating_gained: float
    rank: int | None


@dataclass
class Profile:
    player: PlayerInfo
    rating: float
    start_rating: float
    rank: int | None
    matches_played: int
    wins: int
    losses: int
    draws: int
    form: list[str]
    curve: list[tuple[str, datetime, float]]
    seasons: list[SeasonStat] = field(default_factory=list)
    partners: list[PairStat] = field(default_factory=list)
    opponents: list[PairStat] = field(default_factory=list)
    highlights: dict[str, PairStat | None] = field(default_factory=dict)
    active: bool = False


# --------------------------------------------------------------------------
# Pure read models
# --------------------------------------------------------------------------


def _is_guest(players: dict[str, PlayerInfo], player_id: str) -> bool:
    info = players.get(player_id)
    return bool(info and info.is_guest)


def _ratings_before_session(view: ReplayView, session_id: str | None) -> dict[str, float]:
    """Everyone's rating just before the given session started."""
    snapshot: dict[str, float] = {}
    for entry in view.entries:
        if session_id is not None and entry.session_id == session_id:
            break
        snapshot.update(entry.ratings_after)
    return snapshot


def _gains_before_session(
    view: ReplayView,
    window: tuple[datetime, datetime],
    session_id: str | None,
) -> dict[str, float]:
    """Season gains as they stood just before the given session started."""
    start, end = window
    gains: dict[str, float] = {}
    for entry in view.entries:
        if session_id is not None and entry.session_id == session_id:
            break
        if start <= entry.played_at <= end:
            for player_id, delta in entry.deltas.items():
                gains[player_id] = gains.get(player_id, 0.0) + delta
    return gains


def latest_session_id(rows: Sequence[MatchRow]) -> str | None:
    """The session of the most recent match. Rank movement is measured against it."""
    ordered = match_service.sorted_rows(internal_rows(rows))
    return ordered[-1].session_id if ordered else None


def build_ladder(
    rows: Sequence[MatchRow],
    view: ReplayView,
    players: dict[str, PlayerInfo],
    *,
    window: tuple[datetime, datetime] | None = None,
    active_ids: set[str] | None = None,
    include_guests: bool = False,
) -> Ladder:
    """Rank the field.

    ``window`` set  -> season mode: ranked by rating GAINED inside the window.
    ``window`` None -> all-time:    ranked by absolute rating.

    **The only filter is ``is_guest``** (docs/RATING.md, "Who appears on the
    ladder"). Members are the team and the ranking is theirs; guests are
    included only when the caller asks. There is deliberately no activity
    filter in either mode: a member who missed a whole season still appears,
    with the zero gain that says so.

    Guest matches always stay in the replay -- more than half the history
    involves a guest, so removing them would change the members' ratings. This
    is a presentation filter and nothing else.

    Everyone returned is ranked 1..n, including a player with two matches. A
    player below ``PROVISIONAL_MATCHES`` career matches keeps their rank and is
    flagged ``provisional`` so the UI can say "not settled yet".

    Movement is measured against the standing as it was before the most recent
    session in scope, so a Tuesday evening visibly moves the ladder.
    """
    all_internal = internal_rows(rows)
    scope_rows = rows_within(all_internal, *window) if window else list(all_internal)

    # Every known player, in both modes. Season mode changes what the ranking
    # measures, never who is measured.
    population = {pid for pid in players if include_guests or not _is_guest(players, pid)}
    hidden_guests = 0 if include_guests else sum(1 for info in players.values() if info.is_guest)

    active = active_ids if active_ids is not None else set()
    names = {pid: players[pid].name for pid in population if pid in players}

    ordered = match_service.sorted_rows(all_internal)
    pivot_session = latest_session_id(scope_rows)
    pivot_index = next(
        (i for i, row in enumerate(ordered) if row.session_id == pivot_session),
        len(ordered),
    )
    career_now = {pid: view.matches_played.get(pid, 0) for pid in population}

    # One pass over the replay, not one per player.
    window_gains = view.gain_between(*window) if window else {}

    if window is None:
        values = {pid: view.rating_of(pid) for pid in population}
        previous_snapshot = _ratings_before_session(view, pivot_session)
        # Everyone has a position before the session: a player who has not
        # played yet simply sits at their entry rating.
        previous_values = {
            pid: previous_snapshot.get(pid, match_service.seed_rating(view, pid))
            for pid in population
        }
    else:
        values = {pid: window_gains.get(pid, 0.0) for pid in population}
        previous_gains = _gains_before_session(view, window, pivot_session)
        # In season mode, only players who had already played inside the window
        # had a standing to move from. For everyone else movement is None
        # rather than a meaningless jump from a field tied at zero.
        started_window = players_in(rows_within(ordered[:pivot_index], *window))
        previous_values = {
            pid: previous_gains.get(pid, 0.0) for pid in population if pid in started_window
        }

    ranks = rank_by(values, names)
    previous_ranks = rank_by(previous_values, names)

    entries: list[LadderEntry] = []
    for player_id in population:
        info = players.get(player_id) or PlayerInfo(id=player_id, name=player_id)
        wins, losses, draws = record_for(scope_rows, player_id)
        rank = ranks[player_id]
        previous_rank = previous_ranks.get(player_id)
        gained = (
            window_gains.get(player_id, 0.0)
            if window
            else view.rating_of(player_id) - match_service.seed_rating(view, player_id)
        )
        entries.append(
            LadderEntry(
                rank=rank,
                player_id=player_id,
                name=info.name,
                is_guest=info.is_guest,
                rating=round(view.rating_of(player_id), 1),
                rating_gained=round(gained, 1),
                matches_played=wins + losses + draws,
                career_matches=career_now.get(player_id, 0),
                wins=wins,
                losses=losses,
                draws=draws,
                form=form_for(scope_rows, player_id),
                active=player_id in active,
                provisional=career_now.get(player_id, 0) < PROVISIONAL_MATCHES,
                previous_rank=previous_rank,
                movement=None if previous_rank is None else previous_rank - rank,
            )
        )
    entries.sort(key=lambda e: (e.rank, e.name))
    return Ladder(
        entries=entries,
        threshold=PROVISIONAL_MATCHES,
        includes_guests=include_guests,
        guest_count=hidden_guests,
    )


def _pair_stats(
    rows: Sequence[MatchRow],
    player_id: str,
    players: dict[str, PlayerInfo],
    *,
    partners: bool,
) -> list[PairStat]:
    buckets: dict[str, list[int]] = {}
    for row in internal_rows(rows):
        if row.team_of(player_id) is None:
            continue
        verdict = player_verdict(row, player_id)
        others: Sequence[str]
        if partners:
            partner = row.partner_of(player_id)
            others = [partner] if partner else []
        else:
            others = row.opponents_of(player_id) or ()
        for other in others:
            bucket = buckets.setdefault(other, [0, 0, 0])
            if verdict == WIN:
                bucket[0] += 1
            elif verdict == LOSS:
                bucket[1] += 1
            else:
                bucket[2] += 1
    stats = [
        PairStat(
            player_id=other,
            name=players[other].name if other in players else other,
            matches=wins + losses + draws,
            wins=wins,
            losses=losses,
            draws=draws,
        )
        for other, (wins, losses, draws) in buckets.items()
    ]
    stats.sort(key=lambda s: (-s.matches, s.name))
    return stats


def _pick(
    stats: Sequence[PairStat], *, best: bool, min_sample: int = MIN_HIGHLIGHT_SAMPLE
) -> PairStat | None:
    """Best or worst win rate among pairs with a defensible sample size."""
    candidates = [s for s in stats if s.matches >= min_sample]
    if not candidates:
        return None
    sign = -1 if best else 1
    return min(candidates, key=lambda s: (sign * s.win_rate, -s.matches, s.name))


def build_profile(
    rows: Sequence[MatchRow],
    view: ReplayView,
    players: dict[str, PlayerInfo],
    player_id: str,
    *,
    seasons: Sequence[tuple[str, str, tuple[datetime, datetime]]] = (),
    active_ids: set[str] | None = None,
) -> Profile:
    """One player's whole story: curve, record, form, seasons, chemistry.

    Every partner/opponent number carries ``matches`` so the app never claims
    chemistry it cannot back up.
    """
    info = players.get(player_id) or PlayerInfo(id=player_id, name=player_id)
    all_internal = internal_rows(rows)
    wins, losses, draws = record_for(all_internal, player_id)

    everyone = players_in(all_internal)
    ratings = {pid: view.rating_of(pid) for pid in everyone}
    names = {pid: players[pid].name for pid in everyone if pid in players}
    rank = rank_by(ratings, names).get(player_id)

    season_stats: list[SeasonStat] = []
    for season_id, season_name, window in seasons:
        scope = rows_within(all_internal, *window)
        s_wins, s_losses, s_draws = record_for(scope, player_id)
        gains = view.gain_between(*window)
        eligible = players_in(scope)
        season_rank = rank_by(
            {pid: gains.get(pid, 0.0) for pid in eligible}, names
        ).get(player_id)
        season_stats.append(
            SeasonStat(
                season_id=season_id,
                name=season_name,
                matches=s_wins + s_losses + s_draws,
                wins=s_wins,
                losses=s_losses,
                draws=s_draws,
                rating_gained=round(gains.get(player_id, 0.0), 1),
                rank=season_rank,
            )
        )

    partners = _pair_stats(all_internal, player_id, players, partners=True)
    opponents = _pair_stats(all_internal, player_id, players, partners=False)

    highlights: dict[str, PairStat | None] = {
        # "Bedste makker" / "Værste makker"
        "best_partner": _pick(partners, best=True),
        "worst_partner": _pick(partners, best=False),
        # "Yndlingsoffer" / "Angstmodstander"
        "favourite_victim": _pick(opponents, best=True),
        "nemesis": _pick(opponents, best=False),
        "most_played_partner": partners[0] if partners else None,
        "most_played_opponent": opponents[0] if opponents else None,
    }

    return Profile(
        player=info,
        rating=round(view.rating_of(player_id), 1),
        start_rating=round(match_service.seed_rating(view, player_id), 1),
        rank=rank,
        matches_played=wins + losses + draws,
        wins=wins,
        losses=losses,
        draws=draws,
        form=form_for(all_internal, player_id),
        curve=[(mid, when, round(value, 1)) for mid, when, value in view.curve_for(player_id)],
        seasons=season_stats,
        partners=partners,
        opponents=opponents,
        highlights=highlights,
        active=player_id in (active_ids or set()),
    )


# --------------------------------------------------------------------------
# Database-backed entry points
# --------------------------------------------------------------------------


def create_player(
    db: DbSession,
    *,
    name: str,
    entry_rating: float,
    is_guest: bool = False,
    is_admin: bool = False,
    pin: str | None = None,
) -> Player:
    """Add a player. ``entry_rating`` is required: an admin judges it.

    There is no server-side default on purpose -- someone joining an
    established field is not a 1000-rated player.
    """
    clean = name.strip()
    if not clean:
        raise DomainError("Spilleren skal have et navn.")
    existing = db.execute(select(Player).where(Player.name == clean)).scalar_one_or_none()
    if existing is not None:
        raise DomainError("Der findes allerede en spiller med det navn.")
    player = Player(
        id=new_id(PLAYER_ID_PREFIX),
        name=clean,
        is_guest=is_guest,
        is_admin=is_admin,
        entry_rating=float(entry_rating),
        pin_hash=hash_pin(pin) if pin else None,
    )
    db.add(player)
    db.commit()
    return player


def update_player(
    db: DbSession,
    player_id: str,
    *,
    name: str | None = None,
    is_guest: bool | None = None,
    entry_rating: float | None = None,
    is_admin: bool | None = None,
    pin: str | None = None,
) -> Player:
    """Edit a player. This is how a guest is promoted to a member."""
    player = get_player(db, player_id)
    if name is not None:
        clean = name.strip()
        if not clean:
            raise DomainError("Spilleren skal have et navn.")
        clash = db.execute(
            select(Player).where(Player.name == clean, Player.id != player_id)
        ).scalar_one_or_none()
        if clash is not None:
            raise DomainError("Der findes allerede en spiller med det navn.")
        player.name = clean
    if is_guest is not None:
        player.is_guest = is_guest
    if entry_rating is not None:
        # Changing this changes the replay: every rating downstream moves.
        player.entry_rating = float(entry_rating)
    if is_admin is not None:
        player.is_admin = is_admin
    if pin is not None:
        player.pin_hash = hash_pin(pin)
    db.commit()
    return player


def list_players(db: DbSession) -> list[Player]:
    return list(db.execute(select(Player).order_by(Player.name)).scalars().all())


def get_player(db: DbSession, player_id: str) -> Player:
    player = db.get(Player, player_id)
    if player is None:
        raise NotFoundError("Spilleren findes ikke.")
    return player


def player_index(db: DbSession) -> dict[str, PlayerInfo]:
    return {
        p.id: PlayerInfo(
            id=p.id, name=p.name, is_guest=p.is_guest, entry_rating=p.entry_rating
        )
        for p in list_players(db)
    }


def _window_of(season: Season) -> tuple[datetime, datetime]:
    return day_bounds(season.starts_on, season.ends_on)


def active_player_ids(rows: Sequence[MatchRow], current: Season | None) -> set[str]:
    """Players who have appeared in the current season."""
    if current is None:
        return players_in(internal_rows(rows))
    return players_in(rows_within(internal_rows(rows), *_window_of(current)))


def resolve_ladder_season(db: DbSession, season: str | None) -> Season | None:
    """``all`` -> None (all-time). An id -> that season. Omitted -> current season."""
    if season == "all":
        return None
    seasons = season_service.list_seasons(db)
    if season in (None, "", "current"):
        return season_service.pick_current_season(seasons, datetime.now(UTC).date())
    for candidate in seasons:
        if candidate.id == season:
            return candidate
    raise NotFoundError("Sæsonen findes ikke.")


def get_ladder(
    db: DbSession, season: str | None = None, *, include_guests: bool = False
) -> tuple[Ladder, Season | None]:
    rows = match_service.load_rows(db)
    view = match_service.replay(db)
    players = player_index(db)
    seasons = season_service.list_seasons(db)
    current = season_service.pick_current_season(seasons, datetime.now(UTC).date())
    target = resolve_ladder_season(db, season)
    ladder = build_ladder(
        rows,
        view,
        players,
        window=_window_of(target) if target else None,
        active_ids=active_player_ids(rows, current),
        include_guests=include_guests,
    )
    return ladder, target


def get_profile(db: DbSession, player_id: str) -> Profile:
    player = get_player(db, player_id)
    rows = match_service.load_rows(db)
    view = match_service.replay(db)
    players = player_index(db)
    seasons = season_service.list_seasons(db)
    current = season_service.pick_current_season(seasons, datetime.now(UTC).date())
    return build_profile(
        rows,
        view,
        players,
        player.id,
        seasons=[(s.id, s.name, _window_of(s)) for s in seasons],
        active_ids=active_player_ids(rows, current),
    )


__all__ = [
    "DRAW",
    "LOSS",
    "MIN_HIGHLIGHT_SAMPLE",
    "PROVISIONAL_MATCHES",
    "WIN",
    "Ladder",
    "LadderEntry",
    "PairStat",
    "PlayerInfo",
    "Profile",
    "SeasonStat",
    "active_player_ids",
    "authenticate",
    "build_ladder",
    "build_profile",
    "create_player",
    "get_ladder",
    "get_player",
    "get_profile",
    "hash_pin",
    "latest_session_id",
    "list_players",
    "player_index",
    "resolve_ladder_season",
    "update_player",
    "verify_pin",
]
