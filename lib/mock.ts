/**
 * Mock implementation of the `/api` contract.
 *
 * Every function here returns EXACTLY the shape the corresponding endpoint
 * returns, as described by `lib/types.ts` (which mirrors `/api/openapi.json`).
 * `lib/api.ts` is the only file that knows whether the data came from here or
 * from HTTP; swapping is a one-line change there.
 */

import {
  MATCHES,
  OPEN_SESSION_ID,
  PLAYERS,
  SEASONS,
  SESSIONS,
  CURRENT_SEASON,
  type SeedMatch,
  type SeedSession,
} from "@/lib/mock/seed";
import {
  observedScore,
  replay,
  setVerdict,
  verdictFromScore,
  SEED_RATING,
  type AppliedMatch,
} from "@/lib/mock/engine";
import { PROVISIONAL_MATCHES } from "@/lib/types";
import type {
  CurvePoint,
  EventCountsOut,
  EventCreate,
  EventDetailOut,
  EventMatchupOut,
  EventOut,
  EventScope,
  EventStatus,
  EventType,
  EventUpdate,
  EventResponseOut,
  GuestCreate,
  HighlightsOut,
  LadderEntryOut,
  LadderOut,
  LadderScope,
  MatchCreate,
  MatchOut,
  MatchupsIn,
  MeOut,
  PairStatOut,
  PlayerCreate,
  PlayerDeltaOut,
  PlayerOut,
  PlayerUpdate,
  ProfileOut,
  ResponseState,
  SeasonCreate,
  SeasonOut,
  SeasonUpdate,
  SeasonRef,
  SeasonStatOut,
  SelectionIn,
  SessionCreate,
  SessionDetailOut,
  SessionOut,
  SessionType,
  SessionUpdate,
  TeamSide,
  Verdict,
} from "@/lib/types";

const MOCK_PIN = "1234";
const LATENCY_MS = 140;
/** Mirrors `players/service.py MIN_HIGHLIGHT_SAMPLE`. */
const MIN_HIGHLIGHT_SAMPLE = 2;

/* ---- Mutable mock state ------------------------------------------------- */

/** PlayerOut plus the admin flag, exactly as MeOut is. */
const roster: MeOut[] = PLAYERS.map((p) => ({ ...p }));
const extraMatches: SeedMatch[] = [];
let authed: MeOut | null = null;

const playerById = new Map(roster.map((p) => [p.id, p]));

/**
 * PINs the admin screen has set, by player id. The seed ships none, so
 * `MOCK_PIN` stands in for everybody who has not been given one — the real
 * backend hashes these and never hands them back, and neither does this.
 */
const pins = new Map<string, string>();

/** Sessions are created from the app, so the mock owns a mutable copy. */
const sessionList: SeedSession[] = SESSIONS.map((s) => ({ ...s }));
const sessionById = new Map(sessionList.map((s) => [s.id, s]));

/** Seasons are editable in the admin screen, so the mock owns a copy. */
const seasonList: SeasonOut[] = SEASONS.map((s) => ({ ...s }));
const seasonById = new Map(seasonList.map((s) => [s.id, s]));

/** Exactly one season contains today, the way the backend resolves it. */
function recomputeCurrent(): void {
  const today = new Date().toISOString().slice(0, 10);
  for (const season of seasonList) {
    season.is_current = season.starts_on <= today && today <= season.ends_on;
  }
}

/**
 * Every match the replay should see. A match belonging to a session that has
 * been deleted is not one of them — dropping the session drops its matches,
 * and the next replay is simply a replay without them. Never an inverse
 * update, exactly as the backend does it.
 */
function allMatches(): SeedMatch[] {
  return [...MATCHES, ...extraMatches].filter((m) => sessionById.has(m.session_id));
}

/**
 * Entry ratings are read off the players table, not baked into the engine —
 * see docs/RATING.md. Editing one in the admin screen therefore re-writes
 * history on the next replay, exactly as the real backend does.
 */
function entryRatings(): Record<string, number> {
  return Object.fromEntries(roster.map((p) => [p.id, p.entry_rating]));
}

function entryRatingOf(id: string): number {
  return playerById.get(id)?.entry_rating ?? SEED_RATING;
}

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

function player(id: string): MeOut {
  const found = playerById.get(id);
  if (!found) throw new Error(`Unknown player ${id}`);
  return found;
}

/** The wire shape: /api/players does not carry `is_admin`. */
function playerOut(id: string): PlayerOut {
  const { id: pid, name, is_guest, entry_rating } = player(id);
  return { id: pid, name, is_guest, entry_rating };
}

function seasonRef(id: string): SeasonRef {
  const season = seasonById.get(id);
  return { id, name: season?.name ?? "" };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/* ---- Derived world ------------------------------------------------------ */

interface World {
  applied: AppliedMatch[];
  ratings: Record<string, number>;
  /** Applied matches in chronological order, per player. */
  byPlayer: Map<string, AppliedMatch[]>;
  bySession: Map<string, AppliedMatch[]>;
}

function buildWorld(matches: SeedMatch[]): World {
  const { applied, ratings } = replay(matches, entryRatings());
  const byPlayer = new Map<string, AppliedMatch[]>();
  const bySession = new Map<string, AppliedMatch[]>();
  for (const item of applied) {
    for (const id of [...item.match.team_a, ...item.match.team_b]) {
      const list = byPlayer.get(id) ?? [];
      list.push(item);
      byPlayer.set(id, list);
    }
    const list = bySession.get(item.match.session_id) ?? [];
    list.push(item);
    bySession.set(item.match.session_id, list);
  }
  return { applied, ratings, byPlayer, bySession };
}

function world(): World {
  return buildWorld(allMatches());
}

function isTeamA(item: AppliedMatch, playerId: string): boolean {
  return item.match.team_a.includes(playerId);
}

function verdictFor(item: AppliedMatch, playerId: string): Verdict {
  const a = isTeamA(item, playerId);
  const scoreA = observedScore(item.match.sets);
  return verdictFromScore(a ? scoreA : 1 - scoreA);
}

function sessionOf(item: AppliedMatch): SeedSession {
  const s = sessionById.get(item.match.session_id);
  if (!s) throw new Error(`Unknown session ${item.match.session_id}`);
  return s;
}

function inSeason(item: AppliedMatch, seasonId: string): boolean {
  return sessionOf(item).season_id === seasonId;
}

interface Tally {
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  delta: number;
  gamesFor: number;
  gamesAgainst: number;
}

function emptyTally(): Tally {
  return { wins: 0, losses: 0, draws: 0, matches: 0, delta: 0, gamesFor: 0, gamesAgainst: 0 };
}

function addToTally(tally: Tally, item: AppliedMatch, playerId: string): void {
  const a = isTeamA(item, playerId);
  const v = verdictFor(item, playerId);
  tally.matches += 1;
  tally.delta += item.deltas[playerId] ?? 0;
  tally.gamesFor += a ? item.match.games_a : item.match.games_b;
  tally.gamesAgainst += a ? item.match.games_b : item.match.games_a;
  if (v === "W") tally.wins += 1;
  else if (v === "L") tally.losses += 1;
  else tally.draws += 1;
}

function formOf(items: AppliedMatch[], playerId: string): Verdict[] {
  return items.slice(-5).map((item) => verdictFor(item, playerId));
}

function activePlayerIds(w: World): Set<string> {
  return new Set(
    w.applied
      .filter((item) => inSeason(item, CURRENT_SEASON.id))
      .flatMap((item) => [...item.match.team_a, ...item.match.team_b]),
  );
}

/* ---- Ladder ------------------------------------------------------------- */

/**
 * One list, ranked 1..n. See docs/RATING.md, "Who appears on the ladder":
 *
 * - Members only unless the caller explicitly asks for guests. 54% of matches
 *   involve a guest, so they always feed the engine — this is presentation.
 * - No activity filter. A member who sat out a whole season still appears.
 * - A player under the threshold is flagged, not exiled. They keep their rank;
 *   the UI just says the number is still settling. The threshold counts CAREER
 *   matches, which is why the entry carries both counts.
 */
function buildLadder(
  matches: SeedMatch[],
  scope: LadderScope,
  includeGuests: boolean,
): LadderEntryOut[] {
  const w = buildWorld(matches);
  const active = activePlayerIds(w);

  const entries: LadderEntryOut[] = [];

  for (const p of roster) {
    if (p.is_guest && !includeGuests) continue;
    const all = w.byPlayer.get(p.id) ?? [];
    // A guest only earns a line once they have actually played.
    if (p.is_guest && all.length === 0) continue;

    const scoped = scope === "all" ? all : all.filter((item) => inSeason(item, scope));
    const tally = emptyTally();
    for (const item of scoped) addToTally(tally, item, p.id);

    // The career record is the same sum over every match, not just the ones
    // inside the scope — a season board still reports an all-time W-L-D.
    const career = emptyTally();
    for (const item of all) addToTally(career, item, p.id);

    const rating = w.ratings[p.id] ?? entryRatingOf(p.id);
    entries.push({
      rank: 0,
      previous_rank: null,
      movement: null,
      player_id: p.id,
      name: p.name,
      is_guest: p.is_guest,
      rating: round1(rating),
      rating_gained: round1(scope === "all" ? rating - entryRatingOf(p.id) : tally.delta),
      matches_played: tally.matches,
      career_matches: all.length,
      wins: tally.wins,
      losses: tally.losses,
      draws: tally.draws,
      career_wins: career.wins,
      career_losses: career.losses,
      career_draws: career.draws,
      form: formOf(scoped, p.id),
      provisional: all.length < PROVISIONAL_MATCHES,
      active: active.has(p.id),
    });
  }

  entries.sort((x, y) => {
    const primary = scope === "all" ? y.rating - x.rating : y.rating_gained - x.rating_gained;
    if (Math.abs(primary) > 1e-9) return primary;
    return y.rating - x.rating;
  });
  entries.forEach((entry, index) => {
    entry.rank = index + 1;
  });
  return entries;
}

/** The most recent session that actually produced matches. */
function latestPlayedSessionId(matches: SeedMatch[]): string | null {
  const dated = matches
    .map((m) => ({ id: m.session_id, at: m.played_at }))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  return dated.length > 0 ? dated[0].id : null;
}

export async function getLadder(scope: LadderScope, includeGuests = false): Promise<LadderOut> {
  const matches = allMatches();
  const entries = buildLadder(matches, scope, includeGuests);

  // Movement is measured against the ladder as it stood before the most recent
  // evening — that is the comparison the group chat actually argues about.
  const latest = latestPlayedSessionId(matches);
  const before = buildLadder(
    matches.filter((m) => m.session_id !== latest),
    scope,
    includeGuests,
  );
  const previousRank = new Map(before.map((e) => [e.player_id, e.rank]));

  for (const entry of entries) {
    const prev = previousRank.get(entry.player_id) ?? null;
    entry.previous_rank = prev;
    entry.movement = prev === null ? null : prev - entry.rank;
  }

  const w = buildWorld(matches);
  const guestCount = roster.filter((p) => p.is_guest && (w.byPlayer.get(p.id) ?? []).length > 0).length;

  return delay({
    mode: scope === "all" ? ("all" as const) : ("season" as const),
    season: scope === "all" ? null : seasonRef(scope),
    threshold: PROVISIONAL_MATCHES,
    includes_guests: includeGuests,
    guest_count: guestCount,
    entries,
  });
}

/* ---- Seasons and players ------------------------------------------------ */

export async function getSeasons(): Promise<SeasonOut[]> {
  return delay([...seasonList].sort((a, b) => (a.starts_on < b.starts_on ? 1 : -1)));
}

export async function createSeason(body: SeasonCreate): Promise<SeasonOut> {
  if (!authed?.is_admin) throw new Error("Kun administratorer kan oprette sæsoner");
  if (body.ends_on < body.starts_on) throw new Error("Slutdatoen ligger før startdatoen");
  const clash = seasonList.find(
    (season) => body.starts_on <= season.ends_on && season.starts_on <= body.ends_on,
  );
  if (clash) throw new Error(`Datoerne overlapper ${clash.name}`);

  const created: SeasonOut = {
    id: `se-new-${seasonList.length + 1}`,
    name: body.name.trim(),
    starts_on: body.starts_on,
    ends_on: body.ends_on,
    is_current: false,
  };
  seasonList.push(created);
  seasonById.set(created.id, created);
  recomputeCurrent();
  return delay({ ...created });
}

export async function updateSeason(id: string, body: SeasonUpdate): Promise<SeasonOut> {
  if (!authed?.is_admin) throw new Error("Kun administratorer kan rette sæsoner");
  const target = seasonById.get(id);
  if (!target) throw new Error(`Ukendt sæson: ${id}`);

  const starts = body.starts_on ?? target.starts_on;
  const ends = body.ends_on ?? target.ends_on;
  if (ends < starts) throw new Error("Slutdatoen ligger før startdatoen");
  const clash = seasonList.find(
    (season) => season.id !== id && starts <= season.ends_on && season.starts_on <= ends,
  );
  if (clash) throw new Error(`Datoerne overlapper ${clash.name}`);

  if (body.name !== undefined) target.name = body.name.trim();
  target.starts_on = starts;
  target.ends_on = ends;
  recomputeCurrent();
  return delay({ ...target });
}

export async function getPlayers(): Promise<PlayerOut[]> {
  return delay(roster.map((p) => playerOut(p.id)));
}

export async function createPlayer(body: PlayerCreate): Promise<PlayerOut> {
  if (!authed?.is_admin) throw new Error("Kun administratorer kan tilføje spillere");
  const created: MeOut = {
    id: `p-new-${roster.length + 1}`,
    name: body.name.trim(),
    is_guest: body.is_guest ?? false,
    is_admin: body.is_admin ?? false,
    entry_rating: body.entry_rating,
  };
  roster.push(created);
  playerById.set(created.id, created);
  if (body.pin) pins.set(created.id, body.pin);
  return delay(playerOut(created.id));
}

export async function updatePlayer(id: string, body: PlayerUpdate): Promise<PlayerOut> {
  if (!authed?.is_admin) throw new Error("Kun administratorer kan rette spillere");
  const target = player(id);
  if (body.name !== undefined) target.name = body.name.trim();
  if (body.entry_rating !== undefined) target.entry_rating = body.entry_rating;
  if (body.is_guest !== undefined) target.is_guest = body.is_guest;
  if (body.is_admin !== undefined) target.is_admin = body.is_admin;
  // An omitted pin leaves the old one alone, exactly as PATCH does.
  if (body.pin) pins.set(id, body.pin);
  return delay(playerOut(id));
}

/* ---- Sessions ----------------------------------------------------------- */

function toSessionOut(session: SeedSession, w: World): SessionOut {
  return {
    id: session.id,
    season: seasonRef(session.season_id),
    played_on: session.played_on,
    type: session.type,
    status: session.status,
    note: session.note,
    match_count: (w.bySession.get(session.id) ?? []).length,
  };
}

export async function getSessions(seasonId?: string): Promise<SessionOut[]> {
  const w = world();
  return delay(
    sessionList
      .filter((s) => !seasonId || seasonId === "all" || s.season_id === seasonId)
      .map((s) => toSessionOut(s, w))
      .sort((a, b) => (a.played_on < b.played_on ? 1 : -1)),
  );
}

/** Who won the match: sets decide, games break a tie. Delegates to the engine
 *  so the scorecard and the ladder cannot disagree. See docs/RATING.md. */
function sideOf(sets: Array<{ games_a: number; games_b: number }>): TeamSide {
  const scoreA = observedScore(sets);
  if (scoreA === 1) return "A";
  if (scoreA === 0) return "B";
  return "D";
}

/** Who won one set. A presentation of the engine's rule, not a second copy. */
function setWinner(gamesA: number, gamesB: number): TeamSide {
  const won = setVerdict(gamesA, gamesB);
  if (won === "a") return "A";
  if (won === "b") return "B";
  return "D";
}

function toMatch(item: AppliedMatch, seed: SeedMatch): MatchOut {
  const ids = [...item.match.team_a, ...item.match.team_b];
  return {
    id: item.match.id,
    session_id: item.match.session_id,
    played_at: item.match.played_at,
    source: "internal",
    team_a: item.match.team_a.map(playerOut),
    team_b: item.match.team_b.map(playerOut),
    sets: seed.sets.map((set) => ({
      set_number: set.set_number,
      games_a: set.games_a,
      games_b: set.games_b,
      winner: setWinner(set.games_a, set.games_b),
    })),
    games_a: item.match.games_a,
    games_b: item.match.games_b,
    winner: sideOf(item.match.sets),
    deltas: Object.fromEntries(ids.map((id) => [id, round1(item.deltas[id] ?? 0)])),
  };
}

export async function getSession(id: string): Promise<SessionDetailOut> {
  const session = sessionById.get(id);
  if (!session) throw new Error(`Ukendt aften: ${id}`);
  const seedById = new Map(allMatches().map((m) => [m.id, m]));
  const w = world();
  const items = (w.bySession.get(id) ?? []).sort((a, b) =>
    a.match.played_at < b.match.played_at ? -1 : 1,
  );

  const deltas = new Map<string, number>();
  const ratingAfter = new Map<string, number>();
  for (const item of items) {
    for (const pid of [...item.match.team_a, ...item.match.team_b]) {
      deltas.set(pid, (deltas.get(pid) ?? 0) + (item.deltas[pid] ?? 0));
      ratingAfter.set(pid, item.after[pid] ?? entryRatingOf(pid));
    }
  }

  const line = (pid: string): PlayerDeltaOut => ({
    player_id: pid,
    name: player(pid).name,
    delta: round1(deltas.get(pid) ?? 0),
    rating: round1(ratingAfter.get(pid) ?? entryRatingOf(pid)),
  });

  const moved = [...deltas.entries()].sort((a, b) => b[1] - a[1]);
  // The bundprop is the lowest-rated player as the board stood right after
  // this evening — not today. A recap is a snapshot of that night.
  const lowest = [...ratingAfter.entries()].sort((a, b) => a[1] - b[1])[0];

  return delay({
    id: session.id,
    season: seasonRef(session.season_id),
    played_on: session.played_on,
    type: session.type,
    status: session.status,
    note: session.note,
    matches: items.map((item) => toMatch(item, seedById.get(item.match.id)!)),
    recap: {
      biggest_riser: moved.length > 0 ? line(moved[0][0]) : null,
      biggest_faller: moved.length > 0 ? line(moved[moved.length - 1][0]) : null,
      bundprop: lowest ? line(lowest[0]) : null,
    },
  });
}

/* ---- Player profile ----------------------------------------------------- */

function pairStats(
  items: AppliedMatch[],
  playerId: string,
  side: "partner" | "opponent",
): PairStatOut[] {
  const tallies = new Map<string, Tally>();
  for (const item of items) {
    const a = isTeamA(item, playerId);
    const mine = a ? item.match.team_a : item.match.team_b;
    const theirs = a ? item.match.team_b : item.match.team_a;
    const others = side === "partner" ? mine.filter((id) => id !== playerId) : [...theirs];
    for (const other of others) {
      const tally = tallies.get(other) ?? emptyTally();
      addToTally(tally, item, playerId);
      tallies.set(other, tally);
    }
  }
  return [...tallies.entries()]
    .map(([id, tally]) => ({
      player_id: id,
      name: player(id).name,
      matches: tally.matches,
      wins: tally.wins,
      losses: tally.losses,
      draws: tally.draws,
      win_rate: tally.matches > 0 ? Math.round((tally.wins / tally.matches) * 1000) / 1000 : 0,
    }))
    .sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name, "da"));
}

/**
 * Win rate, but only once there is a sample — and the sample travels with the
 * answer, because the card always prints "3-1 med Jacob".
 */
function pick(stats: PairStatOut[], best: boolean): PairStatOut | null {
  const pool = stats.filter((s) => s.matches >= MIN_HIGHLIGHT_SAMPLE);
  if (pool.length === 0) return null;
  const sorted = [...pool].sort((a, b) => {
    if (a.win_rate !== b.win_rate) return best ? b.win_rate - a.win_rate : a.win_rate - b.win_rate;
    return b.matches - a.matches;
  });
  return sorted[0];
}

/**
 * The two placings the profile carries: among members, which is what the
 * ladder ranks, and over the whole field with guests counted. See
 * docs/RATING.md, "Who appears on the ladder".
 */
function placings(
  values: Map<string, number>,
  playerId: string,
): { rank: number | null; rank_with_guests: number | null } {
  const members = new Map([...values].filter(([pid]) => !player(pid).is_guest));
  return { rank: rankBy(members, playerId), rank_with_guests: rankBy(values, playerId) };
}

/** Rank by a number, highest first, name as the tiebreak. */
function rankBy(values: Map<string, number>, playerId: string): number | null {
  if (!values.has(playerId)) return null;
  const ordered = [...values.entries()].sort(
    (a, b) => b[1] - a[1] || player(a[0]).name.localeCompare(player(b[0]).name, "da"),
  );
  const index = ordered.findIndex(([id]) => id === playerId);
  return index < 0 ? null : index + 1;
}

export async function getPlayerProfile(id: string): Promise<ProfileOut> {
  const w = world();
  const target = player(id);
  const all = w.byPlayer.get(id) ?? [];

  const tally = emptyTally();
  for (const item of all) addToTally(tally, item, id);

  const everyone = new Map<string, number>();
  for (const item of w.applied) {
    for (const pid of [...item.match.team_a, ...item.match.team_b]) {
      everyone.set(pid, w.ratings[pid] ?? entryRatingOf(pid));
    }
  }

  const seasons: SeasonStatOut[] = [...seasonList]
    .sort((a, b) => (a.starts_on < b.starts_on ? -1 : 1))
    .map((season) => {
      const gains = new Map<string, number>();
      for (const item of w.applied) {
        if (!inSeason(item, season.id)) continue;
        for (const pid of [...item.match.team_a, ...item.match.team_b]) {
          gains.set(pid, (gains.get(pid) ?? 0) + (item.deltas[pid] ?? 0));
        }
      }
      const scoped = all.filter((item) => inSeason(item, season.id));
      const seasonTally = emptyTally();
      for (const item of scoped) addToTally(seasonTally, item, id);
      return {
        season_id: season.id,
        name: season.name,
        matches: seasonTally.matches,
        wins: seasonTally.wins,
        losses: seasonTally.losses,
        draws: seasonTally.draws,
        rating_gained: round1(seasonTally.delta),
        ...placings(gains, id),
      };
    });

  const curve: CurvePoint[] = all.map((item) => ({
    match_id: item.match.id,
    played_at: item.match.played_at,
    rating: round1(item.after[id] ?? entryRatingOf(id)),
  }));

  const partners = pairStats(all, id, "partner");
  const opponents = pairStats(all, id, "opponent");
  const highlights: HighlightsOut = {
    best_partner: pick(partners, true),
    worst_partner: pick(partners, false),
    favourite_victim: pick(opponents, true),
    nemesis: pick(opponents, false),
    most_played_partner: partners[0] ?? null,
    most_played_opponent: opponents[0] ?? null,
    min_sample: MIN_HIGHLIGHT_SAMPLE,
  };

  return delay({
    player: playerOut(target.id),
    rating: round1(w.ratings[id] ?? entryRatingOf(id)),
    start_rating: round1(entryRatingOf(id)),
    ...placings(everyone, id),
    matches_played: tally.matches,
    wins: tally.wins,
    losses: tally.losses,
    draws: tally.draws,
    form: formOf(all, id),
    active: activePlayerIds(w).has(id),
    curve,
    seasons,
    partners,
    opponents,
    highlights,
  });
}

/* ---- Auth --------------------------------------------------------------- */

const AUTH_KEY = "rammeslag.auth";

function restoreAuth(): void {
  if (authed || typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(AUTH_KEY);
    if (raw) authed = playerById.get(raw) ?? null;
  } catch {
    authed = null;
  }
}

export async function login(playerId: string, pin: string): Promise<MeOut> {
  if (pin !== (pins.get(playerId) ?? MOCK_PIN)) {
    throw new Error("Forkert PIN");
  }
  authed = player(playerId);
  try {
    window.localStorage.setItem(AUTH_KEY, playerId);
  } catch {
    // Private mode: the session simply does not survive a reload.
  }
  return delay({ ...authed });
}

export async function logout(): Promise<null> {
  authed = null;
  try {
    window.localStorage.removeItem(AUTH_KEY);
  } catch {
    // ignore
  }
  return delay(null);
}

/** 401 in the real API; null here. Reads are public, so this is normal. */
export async function me(): Promise<MeOut | null> {
  restoreAuth();
  return delay(authed ? { ...authed } : null);
}

/* ---- Writes ------------------------------------------------------------- */

export async function createMatch(body: MatchCreate): Promise<MatchOut> {
  if (!authed) throw new Error("Log ind for at gemme kampe");
  const gamesA = body.sets.reduce((s, x) => s + x.games_a, 0);
  const gamesB = body.sets.reduce((s, x) => s + x.games_b, 0);
  const index = allMatches().filter((m) => m.session_id === body.session_id).length;
  const session = sessionById.get(body.session_id);
  const date = session?.played_on ?? new Date().toISOString().slice(0, 10);
  const minutes = 19 * 60 + index * 22;
  const stamp = `${date}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00+02:00`;

  const seed: SeedMatch = {
    id: `m-live-${extraMatches.length + 1}`,
    session_id: body.session_id,
    played_at: stamp,
    team_a: [body.team_a[0], body.team_a[1]],
    team_b: [body.team_b[0], body.team_b[1]],
    games_a: gamesA,
    games_b: gamesB,
    sets: body.sets.map((set, i) => ({ set_number: i + 1, ...set })),
  };
  extraMatches.push(seed);

  const w = world();
  const item = w.applied.find((x) => x.match.id === seed.id)!;
  return delay(toMatch(item, seed));
}

const SESSION_TYPES: SessionType[] = ["training", "casual", "social", "tournament"];

/**
 * POST /api/sessions. The season is resolved from the date, never sent — and
 * when no season covers it the real API answers 400 with exactly this Danish
 * sentence, which is the failure the create form is built around.
 */
export async function createSession(body: SessionCreate): Promise<SessionOut> {
  if (!authed) throw new Error("Log ind for at oprette en session");
  const type = body.type ?? "training";
  if (!SESSION_TYPES.includes(type)) throw new Error("Ukendt sessionstype.");

  const season = seasonList.find(
    (s) => s.starts_on <= body.played_on && body.played_on <= s.ends_on,
  );
  if (!season) throw new Error("Der findes ingen sæson, der dækker den dato.");

  const created: SeedSession = {
    id: `s-new-${sessionList.length + 1}`,
    season_id: season.id,
    played_on: body.played_on,
    type,
    status: "open",
    note: body.note?.trim() ? body.note.trim() : null,
    roster: [],
    match_target: 0,
  };
  sessionList.push(created);
  sessionById.set(created.id, created);
  return delay(toSessionOut(created, world()));
}

export async function closeSession(id: string): Promise<SessionOut> {
  if (!authed) throw new Error("Log ind for at lukke aftenen");
  const session = sessionById.get(id);
  if (!session) throw new Error(`Ukendt aften: ${id}`);
  session.status = "closed";
  return delay(toSessionOut(session, world()));
}

/** Copenhagen, the way the seed stamps it. Summer time from April to September. */
function tzOffsetFor(day: string): string {
  const month = Number(day.slice(5, 7));
  return month >= 4 && month <= 9 ? "+02:00" : "+01:00";
}

/** The same clock time, on another day. */
function restamp(playedAt: string, day: string): string {
  return `${day}T${playedAt.slice(11, 19)}${tzOffsetFor(day)}`;
}

/**
 * PATCH /api/sessions/{id}. An omitted field is left alone; an empty note
 * clears it.
 *
 * Re-dating an evening moves its matches onto the new date, keeping the time
 * of day each one was played at. Ratings are a chronological replay, so an
 * evening listed in February whose matches were still stamped in September
 * would be shown in one place and counted in another.
 */
export async function updateSession(id: string, body: SessionUpdate): Promise<SessionOut> {
  if (!authed) throw new Error("Log ind for at rette en session");
  const session = sessionById.get(id);
  if (!session) throw new Error(`Ukendt aften: ${id}`);

  if (body.type !== undefined && !SESSION_TYPES.includes(body.type)) {
    throw new Error("Ukendt sessionstype.");
  }
  const moving = body.played_on !== undefined && body.played_on !== session.played_on;
  const season = moving
    ? seasonList.find((s) => s.starts_on <= body.played_on! && body.played_on! <= s.ends_on)
    : null;
  if (moving && !season) throw new Error("Der findes ingen sæson, der dækker den dato.");

  if (body.type !== undefined) session.type = body.type;
  if (body.note !== undefined) session.note = body.note.trim() ? body.note.trim() : null;
  if (moving && season && body.played_on) {
    for (const match of allMatches()) {
      if (match.session_id === id) match.played_at = restamp(match.played_at, body.played_on);
    }
    session.played_on = body.played_on;
    session.season_id = season.id;
  }
  return delay(toSessionOut(session, world()));
}

/** DELETE /api/sessions/{id}. Admin only, and it takes the matches with it. */
export async function deleteSession(id: string): Promise<null> {
  if (!authed?.is_admin) throw new Error("Kun administratorer kan slette en session");
  const session = sessionById.get(id);
  if (!session) throw new Error(`Ukendt aften: ${id}`);
  sessionById.delete(id);
  sessionList.splice(sessionList.indexOf(session), 1);
  return delay(null);
}

/* ---- Events -------------------------------------------------------------
 * The calendar half of the app: fixtures and Sunday trainings, and who has
 * said they can come. Same shapes as `/api/events`, same rules — in
 * particular, availability and selection are kept apart here too, because a
 * mock that quietly conflated them would hide the one bug that matters.
 * -------------------------------------------------------------------------- */

interface MockEvent {
  id: string;
  season_id: string;
  type: EventType;
  held_on: string;
  start_time: string;
  venue: string;
  opponent: string | null;
  capacity: number;
  status: EventStatus;
  note: string | null;
  session_id: string | null;
}

interface MockResponse {
  state: ResponseState;
  added_by: string | null;
  updated_at: string;
}

const SEASON_ID = CURRENT_SEASON.id;

const eventList: MockEvent[] = [
  {
    id: "ev-1",
    season_id: SEASON_ID,
    type: "training",
    held_on: "2026-09-27",
    start_time: "10:00:00",
    venue: "Pakhus77",
    opponent: null,
    capacity: 12,
    status: "open",
    note: null,
    session_id: null,
  },
  {
    id: "ev-2",
    season_id: SEASON_ID,
    type: "match",
    held_on: "2026-10-17",
    start_time: "18:00:00",
    venue: "Pakhus77",
    opponent: "Piverts",
    capacity: 6,
    status: "open",
    note: null,
    session_id: null,
  },
  {
    id: "ev-3",
    season_id: SEASON_ID,
    type: "match",
    held_on: "2026-10-23",
    start_time: "18:00:00",
    venue: "Grenaa",
    opponent: "Padelmaster",
    capacity: 6,
    status: "open",
    note: "Kør samlet fra Pakhus77",
    session_id: null,
  },
];

const eventById = new Map(eventList.map((e) => [e.id, e]));
const responsesByEvent = new Map<string, Map<string, MockResponse>>();
const selectionsByEvent = new Map<string, string[]>();
const matchupsByEvent = new Map<string, MatchupsIn["matchups"]>();

/** A plausible spread of answers, so the tallies on screen are not all zero. */
function seedResponses(): void {
  const members = roster.filter((p) => !p.is_guest);
  const pattern: ResponseState[] = ["yes", "yes", "no", "yes", "maybe", "yes", "yes", "no"];
  for (const event of eventList) {
    const answers = new Map<string, MockResponse>();
    members.slice(0, 9).forEach((p, i) => {
      answers.set(p.id, {
        state: pattern[i % pattern.length],
        added_by: p.id,
        updated_at: `${event.held_on}T09:00:00+02:00`,
      });
    });
    responsesByEvent.set(event.id, answers);
  }
}
seedResponses();

function responsesOf(eventId: string): Map<string, MockResponse> {
  let found = responsesByEvent.get(eventId);
  if (!found) {
    found = new Map();
    responsesByEvent.set(eventId, found);
  }
  return found;
}

function mockEvent(id: string): MockEvent {
  const found = eventById.get(id);
  if (!found) throw new Error(`Ukendt begivenhed: ${id}`);
  return found;
}

function countsOf(eventId: string): EventCountsOut {
  const answers = [...responsesOf(eventId).values()].map((r) => r.state);
  const members = roster.filter((p) => !p.is_guest).length;
  return {
    yes: answers.filter((s) => s === "yes").length,
    no: answers.filter((s) => s === "no").length,
    maybe: answers.filter((s) => s === "maybe").length,
    // Guests can push the answered count past the membership.
    unanswered: Math.max(0, members - answers.length),
  };
}

function toEventOut(event: MockEvent): EventOut {
  const counts = countsOf(event.id);
  return {
    id: event.id,
    season: seasonRef(event.season_id),
    type: event.type,
    held_on: event.held_on,
    start_time: event.start_time,
    venue: event.venue,
    opponent: event.opponent,
    capacity: event.capacity,
    status: event.status,
    note: event.note,
    session_id: event.session_id,
    counts,
    selected_count: (selectionsByEvent.get(event.id) ?? []).length,
    surplus: counts.yes - event.capacity,
    my_state: authed ? (responsesOf(event.id).get(authed.id)?.state ?? null) : null,
  };
}

/** Today in Copenhagen, as an ISO date. The real API decides this server-side. */
function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(new Date());
}

export async function getEvents(
  scope: EventScope = "upcoming",
  type?: EventType,
): Promise<EventOut[]> {
  const cutoff = todayISO();
  const rows = eventList
    .filter((e) => !type || e.type === type)
    .filter((e) =>
      scope === "all" ? true : scope === "past" ? e.held_on < cutoff : e.held_on >= cutoff,
    )
    .sort((a, b) =>
      scope === "past"
        ? b.held_on.localeCompare(a.held_on) || b.start_time.localeCompare(a.start_time)
        : a.held_on.localeCompare(b.held_on) || a.start_time.localeCompare(b.start_time),
    );
  return delay(rows.map(toEventOut));
}

export async function getEvent(id: string): Promise<EventDetailOut> {
  const event = mockEvent(id);
  const answers = responsesOf(id);

  const responses: EventResponseOut[] = [...answers.entries()]
    .filter(([playerId]) => playerById.has(playerId))
    .map(([playerId, row]) => ({
      player: playerOut(playerId),
      state: row.state,
      added_by: row.added_by,
      updated_at: row.updated_at,
    }))
    .sort((a, b) => a.player.name.localeCompare(b.player.name, "da"));

  // Members only: nobody asked the guests, so their silence is not an
  // outstanding question.
  const unanswered = roster
    .filter((p) => !p.is_guest && !answers.has(p.id))
    .map((p) => playerOut(p.id))
    .sort((a, b) => a.name.localeCompare(b.name, "da"));

  const selected = (selectionsByEvent.get(id) ?? [])
    .filter((pid) => playerById.has(pid))
    .map(playerOut)
    .sort((a, b) => a.name.localeCompare(b.name, "da"));

  const matchups: EventMatchupOut[] = (matchupsByEvent.get(id) ?? []).map((m) => ({
    round: m.round,
    court: m.court,
    team_a: m.team_a.map(playerOut),
    team_b: m.team_b.map(playerOut),
  }));

  return delay({ ...toEventOut(event), responses, unanswered, selected, matchups });
}

export async function setMyResponse(eventId: string, state: ResponseState): Promise<EventOut> {
  if (!authed) throw new Error("Du skal være logget ind for at gøre det.");
  return setResponseFor(eventId, authed.id, state);
}

export async function setResponseFor(
  eventId: string,
  playerId: string,
  state: ResponseState,
): Promise<EventOut> {
  if (!authed) throw new Error("Du skal være logget ind for at gøre det.");
  const event = mockEvent(eventId);
  if (event.status === "cancelled") throw new Error("Begivenheden er aflyst.");
  // You answer for yourself, for a guest, or — as an admin — for anyone.
  const subject = playerById.get(playerId);
  const allowed = authed.id === playerId || authed.is_admin || subject?.is_guest;
  if (!allowed) throw new Error("Du kan kun svare for dig selv og for gæster.");

  responsesOf(eventId).set(playerId, {
    state,
    added_by: authed.id,
    updated_at: new Date().toISOString(),
  });
  return delay(toEventOut(event));
}

export async function clearResponse(eventId: string, playerId: string): Promise<EventOut> {
  if (!authed) throw new Error("Du skal være logget ind for at gøre det.");
  const event = mockEvent(eventId);
  if (event.status === "cancelled") throw new Error("Begivenheden er aflyst.");
  const subject = playerById.get(playerId);
  const allowed = authed.id === playerId || authed.is_admin || subject?.is_guest;
  if (!allowed) throw new Error("Du kan kun svare for dig selv og for gæster.");

  responsesOf(eventId).delete(playerId);
  return delay(toEventOut(event));
}

export async function createEvent(body: EventCreate): Promise<EventOut> {
  if (!authed?.is_admin) throw new Error("Kun en administrator kan gøre det.");
  const season = seasonList.find(
    (s) => s.starts_on <= body.held_on && body.held_on <= s.ends_on,
  );
  if (!season) throw new Error("Der findes ingen sæson, der dækker den dato.");

  const created: MockEvent = {
    id: `ev-new-${eventList.length + 1}`,
    season_id: season.id,
    type: body.type,
    held_on: body.held_on,
    start_time: body.start_time.length === 5 ? `${body.start_time}:00` : body.start_time,
    venue: body.venue.trim(),
    // A training never carries an opponent, whatever is sent.
    opponent: body.type === "match" ? (body.opponent?.trim() || null) : null,
    capacity: body.capacity ?? (body.type === "match" ? 6 : 12),
    status: "open",
    note: body.note?.trim() ? body.note.trim() : null,
    session_id: null,
  };
  eventList.push(created);
  eventById.set(created.id, created);
  return delay(toEventOut(created));
}

export async function updateEvent(id: string, body: EventUpdate): Promise<EventOut> {
  if (!authed?.is_admin) throw new Error("Kun en administrator kan gøre det.");
  const event = mockEvent(id);

  if (body.held_on !== undefined && body.held_on !== event.held_on) {
    const season = seasonList.find(
      (s) => s.starts_on <= body.held_on! && body.held_on! <= s.ends_on,
    );
    if (!season) throw new Error("Der findes ingen sæson, der dækker den dato.");
    event.held_on = body.held_on;
    event.season_id = season.id;
  }
  if (body.start_time !== undefined) {
    event.start_time = body.start_time.length === 5 ? `${body.start_time}:00` : body.start_time;
  }
  if (body.venue !== undefined) event.venue = body.venue.trim();
  if (body.opponent !== undefined && event.type === "match") {
    event.opponent = body.opponent?.trim() || null;
  }
  if (body.capacity !== undefined) event.capacity = body.capacity;
  if (body.status !== undefined) event.status = body.status;
  if (body.note !== undefined) event.note = body.note.trim() ? body.note.trim() : null;
  return delay(toEventOut(event));
}

export async function deleteEvent(id: string): Promise<null> {
  if (!authed?.is_admin) throw new Error("Kun en administrator kan gøre det.");
  const event = mockEvent(id);
  eventById.delete(id);
  eventList.splice(eventList.indexOf(event), 1);
  responsesByEvent.delete(id);
  selectionsByEvent.delete(id);
  matchupsByEvent.delete(id);
  return delay(null);
}

/** The squad, replaced wholesale. Nothing here touches anybody's answer. */
export async function setSelection(id: string, body: SelectionIn): Promise<EventDetailOut> {
  if (!authed?.is_admin) throw new Error("Kun en administrator kan gøre det.");
  mockEvent(id);
  selectionsByEvent.set(id, [...new Set(body.player_ids)]);
  return getEvent(id);
}

/** The plan, replaced wholesale. A whiteboard: none of this becomes a match. */
export async function setMatchups(id: string, body: MatchupsIn): Promise<EventDetailOut> {
  if (!authed?.is_admin) throw new Error("Kun en administrator kan gøre det.");
  mockEvent(id);
  matchupsByEvent.set(id, body.matchups);
  return getEvent(id);
}

export async function createSessionForEvent(id: string): Promise<SessionOut> {
  if (!authed?.is_admin) throw new Error("Kun en administrator kan gøre det.");
  const event = mockEvent(id);
  if (event.type !== "training") throw new Error("Kun en træning kan blive til en session.");
  if (event.status === "cancelled") throw new Error("Træningen er aflyst.");
  if (event.session_id) throw new Error("Der er allerede oprettet en session for træningen.");

  const created = await createSession({
    played_on: event.held_on,
    type: "training",
    note: event.note,
  });
  event.session_id = created.id;
  return created;
}

/**
 * Any logged-in player, not just an admin. Enters at the seed rating and gets
 * no PIN. An existing name comes back as itself rather than as an error: two
 * people adding the same guest is a collision of intent, not a mistake.
 */
export async function createGuest(body: GuestCreate): Promise<PlayerOut> {
  if (!authed) throw new Error("Du skal være logget ind for at gøre det.");
  const clean = body.name.trim();
  if (!clean) throw new Error("Gæsten skal have et navn.");
  const existing = roster.find((p) => p.name === clean);
  if (existing) return delay(playerOut(existing.id));

  const created: MeOut = {
    id: `p-guest-${roster.length + 1}`,
    name: clean,
    is_guest: true,
    is_admin: false,
    entry_rating: SEED_RATING,
  };
  roster.push(created);
  playerById.set(created.id, created);
  return delay(playerOut(created.id));
}

export { OPEN_SESSION_ID };
