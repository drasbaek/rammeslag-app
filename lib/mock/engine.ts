/**
 * A TypeScript replay of `docs/RATING.md`, used only to make the mock layer
 * internally consistent (ladder, curves and session recaps all agree).
 *
 * The backend's `modules/rating/engine.py` is the normative implementation.
 * This file exists so the UI can be built against numbers that behave like the
 * real ones; it is deleted the day `lib/api.ts` points at the real API.
 */

export const SEED_RATING = 1000.0;
export const K_STANDARD = 20.0;
export const K_PROVISIONAL = 40.0;
export const PROVISIONAL_MATCHES = 5;
export const ELO_SCALE = 400.0;

export interface MatchInput {
  id: string;
  session_id: string;
  played_at: string;
  team_a: [string, string];
  team_b: [string, string];
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

export function verdict(gamesFor: number, gamesAgainst: number): "W" | "L" | "D" {
  if (gamesFor > gamesAgainst) return "W";
  if (gamesFor < gamesAgainst) return "L";
  return "D";
}

/** Display-only set verdict: two clear games, or 7-6. See docs/RATING.md. */
export function setVerdict(gamesA: number, gamesB: number): "a" | "b" | null {
  const diff = Math.abs(gamesA - gamesB);
  if (diff >= 2) return gamesA > gamesB ? "a" : "b";
  if ((gamesA === 7 && gamesB === 6) || (gamesB === 7 && gamesA === 6)) {
    return gamesA > gamesB ? "a" : "b";
  }
  return null;
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

    const sa = match.games_a > match.games_b ? 1 : match.games_a < match.games_b ? 0 : 0.5;
    const sb = 1 - sa;
    const mov = 1 + Math.abs(match.games_a - match.games_b) / total;

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
