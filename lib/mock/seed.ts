/**
 * Deterministic fake history for the mock API. Pseudonymised names only —
 * nothing here comes from `export/`.
 *
 * Everything (ladder, curves, recaps) is derived from these raw matches by the
 * replay in `./engine`, so the numbers on screen behave like real ones.
 */

import type { MeOut, SeasonOut, SessionType, SessionStatus } from "@/lib/types";
import type { MatchInput } from "./engine";

/* ---- Deterministic PRNG (mulberry32) ------------------------------------ */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260919);

const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

/* ---- Players ------------------------------------------------------------ */

interface SeedPlayer extends MeOut {
  /** Latent strength, 0..1. Only used to generate plausible scorelines. */
  skill: number;
  /** How often this member turns up. Guests get a single evening instead. */
  attendance: number;
}

function member(
  id: string,
  name: string,
  skill: number,
  attendance: number,
  entry_rating: number,
  is_admin = false,
): SeedPlayer {
  return { id, name, is_guest: false, is_admin, entry_rating, skill, attendance };
}

function guest(id: string, name: string, skill: number, entry_rating: number): SeedPlayer {
  return { id, name, is_guest: true, is_admin: false, entry_rating, skill, attendance: 0 };
}

/**
 * Thirteen members and fifteen guests.
 *
 * The numbers this history replays into are the ones the UI has to survive: a
 * leader clear at 1306, six people between 1029 and 1086 who can swap places
 * on a single evening, a bundprop ninety points adrift at 728, and match
 * counts from 6 to 49. The guests land in a 150-point clump around the middle
 * with one to three matches each — which is exactly why the ladder hides them
 * behind a switch.
 *
 * Entry ratings are per player and deliberately not all 1000 (docs/RATING.md:
 * a newcomer joining an established field is not a 1000-rated player, and the
 * admin decides). One member carries the 1100 the old app recorded; two others
 * were judged in at 900 and 800.
 */
export const SEED_PLAYERS: SeedPlayer[] = [
  member("p1", "Jacob Riis", 1.02, 0.86, 1100, true),
  member("p2", "Mikkel Bang", 0.66, 0.935, 800),
  member("p3", "Anders Krag", 0.66, 0.93, 810),
  member("p4", "Kasper Vig", 0.62, 0.72, 1080),
  member("p5", "Frederik Lund", 0.58, 0.68, 1070),
  member("p6", "Rasmus Dahl", 0.54, 0.544, 1050),
  member("p7", "Emil Krogh", 0.5, 0.6, 1200),
  member("p8", "Nikolaj Brandt", 0.46, 0.58, 1170),
  member("p9", "Sebastian Mørk", 0.42, 0.55, 1030),
  member("p10", "Lauge Winther", 0.38, 0.416, 980),
  member("p11", "Christian Aaby", 0.34, 0.36, 1020),
  member("p12", "Magnus Told", 0.3, 0.3, 850),
  member("p13", "Oliver Thams", 0.16, 0.62, 900),

  guest("g1", "Thomas Brix", 0.55, 990),
  guest("g2", "Villads Hein", 0.48, 1020),
  guest("g3", "Simon Dall", 0.6, 1020),
  guest("g4", "Peter Kann", 0.44, 980),
  guest("g5", "Mads Ejby", 0.52, 1060),
  guest("g6", "Jonas Friis", 0.5, 1060),
  guest("g7", "Henrik Vad", 0.42, 1000),
  guest("g8", "Martin Sø", 0.58, 1100),
  guest("g9", "Rune Klit", 0.46, 970),
  guest("g10", "Bjarke Lind", 0.54, 990),
  guest("g11", "Søren Ager", 0.5, 950),
  guest("g12", "Kristian Ry", 0.47, 950),
  guest("g13", "Daniel Holt", 0.53, 950),
  guest("g14", "Jeppe Norup", 0.45, 970),
  guest("g15", "Alexander Beck", 0.56, 1020),
];
const MEMBER_IDS = SEED_PLAYERS.filter((p) => !p.is_guest).map((p) => p.id);
const GUEST_IDS = SEED_PLAYERS.filter((p) => p.is_guest).map((p) => p.id);

/**
 * The mock roster. `MeOut` is exactly PlayerOut plus `is_admin`, which is the
 * one extra thing the mock needs to answer /api/auth/me — `getPlayers()`
 * strips it back down to PlayerOut, like the real endpoint.
 */
export const PLAYERS: MeOut[] = SEED_PLAYERS.map((p) => ({
  id: p.id,
  name: p.name,
  is_guest: p.is_guest,
  is_admin: p.is_admin,
  entry_rating: p.entry_rating,
}));

export const ENTRY_RATINGS: Record<string, number> = Object.fromEntries(
  SEED_PLAYERS.map((p) => [p.id, p.entry_rating]),
);

const skillOf = Object.fromEntries(SEED_PLAYERS.map((p) => [p.id, p.skill]));
const attendanceOf = Object.fromEntries(SEED_PLAYERS.map((p) => [p.id, p.attendance]));

/* ---- Seasons ------------------------------------------------------------ */

export const SEASONS: SeasonOut[] = [
  {
    id: "se-2026-f",
    name: "Forår 2026",
    starts_on: "2026-01-01",
    ends_on: "2026-06-30",
    is_current: false,
  },
  {
    id: "se-2026-e",
    name: "Efterår 2026",
    starts_on: "2026-08-01",
    ends_on: "2026-12-20",
    is_current: true,
  },
];

export const CURRENT_SEASON = SEASONS[1];

/* ---- Sessions ----------------------------------------------------------- */

export interface SeedSession {
  id: string;
  season_id: string;
  played_on: string;
  type: SessionType;
  status: SessionStatus;
  note: string | null;
  roster: string[];
  match_target: number;
}

const SPRING_DATES = [
  "2026-01-15",
  "2026-01-29",
  "2026-02-12",
  "2026-02-26",
  "2026-03-12",
  "2026-03-26",
  "2026-04-16",
  "2026-04-30",
  "2026-05-21",
  "2026-06-04",
];

const AUTUMN_DATES = ["2026-08-13", "2026-08-27", "2026-09-03", "2026-09-10", "2026-09-17"];

const NOTES = [
  null,
  "Bane 3 og 4. Kold hal.",
  "To mand i forfald, gæst hentet ind.",
  null,
  "Sidste aften før efterårsferien.",
];

/** Each guest drops in for exactly one evening, in order. */
function guestForSession(index: number): string | undefined {
  return index < GUEST_IDS.length ? GUEST_IDS[index] : undefined;
}

function rosterFor(index: number, size = 8): string[] {
  const scored = MEMBER_IDS.map((id) => ({ id, score: attendanceOf[id] + rand() * 0.78 }));
  scored.sort((a, b) => b.score - a.score);
  const visitor = guestForSession(index);
  const members = scored.map((x) => x.id).slice(0, visitor ? size - 1 : size);
  return visitor ? [visitor, ...members] : members;
}

export const SESSIONS: SeedSession[] = [
  ...SPRING_DATES.map((played_on, i) => ({
    id: `s-f${String(i + 1).padStart(2, "0")}`,
    season_id: "se-2026-f",
    played_on,
    type: "training" as SessionType,
    status: "closed" as SessionStatus,
    note: NOTES[i % NOTES.length],
    roster: rosterFor(i),
    match_target: 6,
  })),
  ...AUTUMN_DATES.map((played_on, i) => ({
    id: `s-e${String(i + 1).padStart(2, "0")}`,
    season_id: "se-2026-e",
    played_on,
    type: "training" as SessionType,
    status: "closed" as SessionStatus,
    note: NOTES[(i + 2) % NOTES.length],
    roster: rosterFor(i + SPRING_DATES.length),
    match_target: 6,
  })),
];

// A bøde-evening with no padel at all: variation lives in session.type.
SESSIONS.push({
  id: "s-e06",
  season_id: "se-2026-e",
  played_on: "2026-09-12",
  type: "social",
  status: "closed",
  note: "Bødekasse og fadøl. Ingen ketsjere.",
  roster: ["p1", "p2", "p3", "p5", "p6", "p9"],
  match_target: 0,
});

// Tonight, still open — this is what the entry flow writes into.
export const OPEN_SESSION_ID = "s-e07";
SESSIONS.push({
  id: OPEN_SESSION_ID,
  season_id: "se-2026-e",
  played_on: "2026-09-19",
  type: "training",
  status: "open",
  note: null,
  roster: ["p1", "p2", "p3", "p4", "p6", "p7", "p9", "p13"],
  match_target: 6,
});

/* ---- Matches ------------------------------------------------------------ */

function tzOffset(date: string): string {
  const month = Number(date.slice(5, 7));
  return month >= 4 && month <= 9 ? "+02:00" : "+01:00";
}

function playedAt(date: string, index: number): string {
  const start = 19 * 60;
  const minutes = start + index * 22;
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${date}T${hh}:${mm}:00${tzOffset(date)}`;
}

/** Americano-flavoured rotation: everybody partners with somebody new. */
function pairingsFor(roster: string[], count: number): Array<[string[], string[]]> {
  const out: Array<[string[], string[]]> = [];
  const n = roster.length;
  for (let m = 0; m < count; m += 1) {
    const offset = (m * 3) % n;
    const order = Array.from({ length: n }, (_, i) => roster[(i + offset) % n]);
    const four = order.slice(0, 4);
    if (m % 2 === 1 && n >= 8) {
      const alt = order.slice(4, 8);
      out.push([
        [alt[0], alt[3]],
        [alt[1], alt[2]],
      ]);
    } else {
      out.push([
        [four[0], four[3]],
        [four[1], four[2]],
      ]);
    }
  }
  return out;
}

export interface SeedSet {
  set_number: number;
  games_a: number;
  games_b: number;
}

export interface SeedMatch extends MatchInput {
  sets: SeedSet[];
}

function generateSets(pA: number): SeedSet[] {
  const roll = rand();
  const setCount = roll < 0.16 ? 1 : roll < 0.84 ? 2 : 3;
  const sets: SeedSet[] = [];
  for (let i = 0; i < setCount; i += 1) {
    const total = between(7, 11);
    if (rand() < 0.1 && total % 2 === 0) {
      // Timed sets end level more often than people remember.
      sets.push({ set_number: i + 1, games_a: total / 2, games_b: total / 2 });
      continue;
    }
    const aWins = rand() < pA;
    const winner = Math.ceil(total / 2) + between(0, Math.max(0, Math.floor(total / 2) - 1));
    const games = Math.min(winner, total);
    sets.push({
      set_number: i + 1,
      games_a: aWins ? games : total - games,
      games_b: aWins ? total - games : games,
    });
  }
  return sets;
}

function teamSkill(ids: string[]): number {
  return (skillOf[ids[0]] + skillOf[ids[1]]) / 2;
}

export const MATCHES: SeedMatch[] = (() => {
  const out: SeedMatch[] = [];
  let counter = 0;
  for (const session of SESSIONS) {
    const count = session.id === OPEN_SESSION_ID ? 2 : session.match_target; // tonight is half-played
    const pairings = pairingsFor(session.roster, count);
    // A guest plays two or three matches and then watches — they are not a
    // fixture of the evening, and the ladder must not treat them like one.
    const guestCap = 1 + Math.floor(rand() * 3); // one to three matches, then they watch
    let guestSeen = 0;
    const guestId = session.roster.find((id) => id.startsWith("g"));

    pairings.forEach((pairing, index) => {
      const teams = pairing.map((team) =>
        team.map((id) => {
          if (guestId && id === guestId) {
            if (guestSeen >= guestCap) {
              const bench = session.roster.find(
                (candidate) => candidate !== guestId && !pairing.flat().includes(candidate),
              );
              if (bench) return bench;
            }
          }
          return id;
        }),
      ) as [string[], string[]];
      if (guestId && teams.flat().includes(guestId)) guestSeen += 1;

      const [a, b] = teams;
      const diff = teamSkill(a) - teamSkill(b);
      const pA = 1 / (1 + Math.pow(10, -diff * 4.2));
      const sets = generateSets(pA);
      counter += 1;
      out.push({
        id: `m-${String(counter).padStart(3, "0")}`,
        session_id: session.id,
        played_at: playedAt(session.played_on, index),
        team_a: [a[0], a[1]],
        team_b: [b[0], b[1]],
        games_a: sets.reduce((s, x) => s + x.games_a, 0),
        games_b: sets.reduce((s, x) => s + x.games_b, 0),
        sets,
      });
    });
  }
  return out;
})();
