/**
 * Per-player numbers for one evening, folded out of the matches the session
 * endpoint already returns.
 *
 * `GET /api/sessions/{id}` answers with matches (each carrying `deltas`) and a
 * three-line recap. It does not answer with a per-player table, so the parts
 * of the screen that show one — the movement bars, and the sample size next to
 * every recap claim — count it here. Nothing is invented: every number below
 * is a sum over `matches`.
 */

import type { MatchOut, PlayerId, PlayerOut } from "@/lib/types";

export interface SessionStanding {
  player_id: PlayerId;
  name: string;
  /** Rating moved across the evening. */
  delta: number;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
}

/** Everyone who played, whichever side they were on. */
export function participants(matches: MatchOut[]): PlayerOut[] {
  const seen = new Map<PlayerId, PlayerOut>();
  for (const match of matches) {
    for (const player of [...match.team_a, ...match.team_b]) {
      if (!seen.has(player.id)) seen.set(player.id, player);
    }
  }
  return [...seen.values()];
}

/** Best movement first. Ties fall back to the match count, then the name. */
export function sessionStandings(matches: MatchOut[]): SessionStanding[] {
  const rows = new Map<PlayerId, SessionStanding>();

  for (const match of matches) {
    for (const [side, team] of [
      ["A", match.team_a],
      ["B", match.team_b],
    ] as const) {
      for (const player of team) {
        const row =
          rows.get(player.id) ??
          ({
            player_id: player.id,
            name: player.name,
            delta: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            matches: 0,
          } satisfies SessionStanding);
        row.delta += match.deltas[player.id] ?? 0;
        row.matches += 1;
        if (match.winner === "D") row.draws += 1;
        else if (match.winner === side) row.wins += 1;
        else row.losses += 1;
        rows.set(player.id, row);
      }
    }
  }

  return [...rows.values()]
    .map((row) => ({ ...row, delta: Math.round(row.delta * 10) / 10 }))
    .sort((a, b) => b.delta - a.delta || b.matches - a.matches || a.name.localeCompare(b.name, "da"));
}

export function standingOf(
  standings: SessionStanding[],
  playerId: PlayerId,
): SessionStanding | null {
  return standings.find((row) => row.player_id === playerId) ?? null;
}
