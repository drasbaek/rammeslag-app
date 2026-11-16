/**
 * A TypeScript replay of `docs/RATING.md`, used only to make the mock layer
 * internally consistent (ladder, curves and session recaps all agree).
 *
 * The backend's `modules/rating/engine.py` is the normative implementation.
 * This file exists so the UI can be built against numbers that behave like the
 * real ones; it is deleted the day `lib/api.ts` points at the real API.
 */

export const SEED_RATING = 1000.0;
export const K_STANDARD = 28.0;
export const K_PROVISIONAL = 56.0;
export const PROVISIONAL_MATCHES = 5;
export const MOV_SCALE = 1.75;
export const ELO_SCALE = 400.0;

/** One set as played. A match-tie carries points in the games fields. */
export interface ScoreSet {
  games_a: number;
  games_b: number;
  tiebreak?: boolean;
}

export interface MatchInput {
  id: string;
  session_id: string;
  played_at: string;
  team_a: [string, string];
  team_b: [string, string];
  /** Per-set games, in the order played. The rating reads this, not the totals. */
  sets: ScoreSet[];
  /** Regular sets only: a match-tie's points are never games. */
  games_a: number;
  games_b: number;
}

export interface AppliedMatch {
  match: MatchInput;
  /** Rating change per player id for this match. */
  deltas: Record<string, number>;
  /** Rating after this match per player id. */
  after: Record<string, number>;
}

export interface ReplayResult {
  ratings: Record<string, number>;
  applied: AppliedMatch[];
  matchesPlayed: Record<string, number>;
}

/**
 * A set is won on a two-game lead, or at 7-6. A match-tie is won on a
 * two-point lead and nothing else — 7-6 in points is unfinished. A level set
 * belongs to nobody. Normative: this feeds the rating. See docs/RATING.md.
 */
export function setVerdict(gamesA: number, gamesB: number, tiebreak = false): "a" | "b" | null {
  const diff = Math.abs(gamesA - gamesB);
  if (diff >= 2) return gamesA > gamesB ? "a" : "b";
  if (tiebreak) return null;
  if ((gamesA === 7 && gamesB === 6) || (gamesB === 7 && gamesA === 6)) {
    return gamesA > gamesB ? "a" : "b";
  }
  return null;
}

/** Game totals over the regular sets. A match-tie's points are not games. */
export function gameTotals(sets: ScoreSet[]): [number, number] {
  const regular = sets.filter((set) => !set.tiebreak);
  return [
    regular.reduce((sum, set) => sum + set.games_a, 0),
    regular.reduce((sum, set) => sum + set.games_b, 0),
  ];
}

/** The lead in games it takes to decide a match that is level on sets. */
export const GAME_MARGIN_TO_DECIDE = 2;

/**
 * Team A's observed score. Sets decide, a match-tie counting as one. Level on
 * sets, the games decide only by two or more — 6-4 6-7 is a draw.
 */
export function observedScore(sets: ScoreSet[]): number {
  let takenA = 0;
  let takenB = 0;
  for (const set of sets) {
    const won = setVerdict(set.games_a, set.games_b, Boolean(set.tiebreak));
    if (won === "a") takenA += 1;
    else if (won === "b") takenB += 1;
  }
  if (takenA > takenB) return 1;
  if (takenB > takenA) return 0;

  const [gamesA, gamesB] = gameTotals(sets);
  if (gamesA - gamesB >= GAME_MARGIN_TO_DECIDE) return 1;
  if (gamesB - gamesA >= GAME_MARGIN_TO_DECIDE) return 0;
  return 0.5;
}

/** W / L / D for the side whose observed score this is. */
export function verdictFromScore(score: number): "W" | "L" | "D" {
  if (score === 1) return "W";
  if (score === 0) return "L";
  return "D";
}

/**
 * Proportional margin term. The arguments are the WINNER's game totals, so a
 * side that takes the sets while trailing on games earns no bonus rather than
 * a perverse one.
 */
export function marginMultiplier(gamesWon: number, gamesLost: number): number {
  const total = gamesWon + gamesLost;
  return 1 + (MOV_SCALE * Math.max(0, gamesWon - gamesLost)) / total;
}

function chronological(matches: MatchInput[]): MatchInput[] {
  return [...matches].sort((x, y) => {
    if (x.played_at !== y.played_at) return x.played_at < y.played_at ? -1 : 1;
    return x.id < y.id ? -1 : 1;
  });
}

/**
 * `entryRatings` is the admin-set starting point per player. docs/RATING.md
 * seeds everybody at 1000; entry ratings generalise that, and 1000 remains the
 * fallback for anyone without one.
 */
export function replay(
  matches: MatchInput[],
  entryRatings: Record<string, number> = {},
): ReplayResult {
  const ratings: Record<string, number> = {};
  const matchesPlayed: Record<string, number> = {};
  const applied: AppliedMatch[] = [];

  const rating = (id: string) => (id in ratings ? ratings[id] : (entryRatings[id] ?? SEED_RATING));

  for (const match of chronological(matches)) {
    const total = match.games_a + match.games_b;
    const ids = [...match.team_a, ...match.team_b];
    if (total === 0) {
      // A match with no games does not affect ratings at all.
      applied.push({
        match,
        deltas: Object.fromEntries(ids.map((id) => [id, 0])),
        after: Object.fromEntries(ids.map((id) => [id, rating(id)])),
      });
      continue;
    }

    const ra = (rating(match.team_a[0]) + rating(match.team_a[1])) / 2;
    const rb = (rating(match.team_b[0]) + rating(match.team_b[1])) / 2;
    const ea = 1 / (1 + Math.pow(10, (rb - ra) / ELO_SCALE));
    const eb = 1 - ea;

    const sa = observedScore(match.sets);
    const sb = 1 - sa;
    // The margin follows the winner; a draw is level on games either way.
    const mov =
      sa < 0.5
        ? marginMultiplier(match.games_b, match.games_a)
        : marginMultiplier(match.games_a, match.games_b);

    const deltas: Record<string, number> = {};
    const after: Record<string, number> = {};

    for (const [team, s, e] of [
      [match.team_a, sa, ea],
      [match.team_b, sb, eb],
    ] as const) {
      for (const id of team) {
        const k = (matchesPlayed[id] ?? 0) < PROVISIONAL_MATCHES ? K_PROVISIONAL : K_STANDARD;
        deltas[id] = k * mov * (s - e);
      }
    }

    for (const id of ids) {
      ratings[id] = rating(id) + deltas[id];
      after[id] = ratings[id];
      matchesPlayed[id] = (matchesPlayed[id] ?? 0) + 1;
    }

    applied.push({ match, deltas, after });
  }

  return { ratings, applied, matchesPlayed };
}
