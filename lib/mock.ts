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
import { replay, verdict, SEED_RATING, type AppliedMatch } from "@/lib/mock/engine";
import { PROVISIONAL_MATCHES } from "@/lib/types";
import type {
  CurvePoint,
  HighlightsOut,
  LadderEntryOut,
  LadderOut,
  LadderScope,
  MatchCreate,
  MatchOut,
  MeOut,
  PairStatOut,
  PlayerCreate,
  PlayerDeltaOut,
  PlayerOut,
  PlayerUpdate,
  ProfileOut,
  SeasonOut,
  SeasonRef,
  SeasonStatOut,
  SessionDetailOut,
  SessionOut,
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
const sessionById = new Map(SESSIONS.map((s) => [s.id, s]));
const seasonById = new Map(SEASONS.map((s) => [s.id, s]));

function allMatches(): SeedMatch[] {
  return [...MATCHES, ...extraMatches];
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
  return verdict(a ? item.match.games_a : item.match.games_b, a ? item.match.games_b : item.match.games_a);
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
  return delay([...SEASONS].sort((a, b) => (a.starts_on < b.starts_on ? 1 : -1)));
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
  return delay(playerOut(created.id));
}

export async function updatePlayer(id: string, body: PlayerUpdate): Promise<PlayerOut> {
  if (!authed?.is_admin) throw new Error("Kun administratorer kan rette spillere");
  const target = player(id);
  if (body.name !== undefined) target.name = body.name.trim();
  if (body.entry_rating !== undefined) target.entry_rating = body.entry_rating;
  if (body.is_guest !== undefined) target.is_guest = body.is_guest;
  if (body.is_admin !== undefined) target.is_admin = body.is_admin;
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
    SESSIONS.filter((s) => !seasonId || seasonId === "all" || s.season_id === seasonId)
      .map((s) => toSessionOut(s, w))
      .sort((a, b) => (a.played_on < b.played_on ? 1 : -1)),
  );
}

function sideOf(gamesA: number, gamesB: number): TeamSide {
  if (gamesA > gamesB) return "A";
  if (gamesA < gamesB) return "B";
  return "D";
}

/** Display-only set verdict: two clear games, or 7-6. See docs/RATING.md. */
function setWinner(gamesA: number, gamesB: number): TeamSide {
  const diff = Math.abs(gamesA - gamesB);
  if (diff >= 2 || (diff === 1 && Math.max(gamesA, gamesB) === 7)) {
    return gamesA > gamesB ? "A" : "B";
  }
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
    winner: sideOf(item.match.games_a, item.match.games_b),
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

  const seasons: SeasonStatOut[] = [...SEASONS]
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
        rank: rankBy(gains, id),
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
    rank: rankBy(everyone, id),
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
  if (pin !== MOCK_PIN) {
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

export async function closeSession(id: string): Promise<SessionOut> {
  if (!authed) throw new Error("Log ind for at lukke aftenen");
  const session = sessionById.get(id);
  if (!session) throw new Error(`Ukendt aften: ${id}`);
  session.status = "closed";
  return delay(toSessionOut(session, world()));
}

export { OPEN_SESSION_ID };
