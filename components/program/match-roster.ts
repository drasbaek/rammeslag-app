import { responseLabel } from "@/lib/format";
import type { EventDetailOut, PlayerOut, ResponseState } from "@/lib/types";

/**
 * What a player answered, with silence as a value rather than a missing key.
 *
 * The API models "has not answered" as the absence of a row, which is right
 * for a table and awkward for a list that has to show all four cases next to
 * each other. Null is that fourth case here, and it is never rendered as an
 * answer.
 */
export type SquadState = ResponseState | null;

export interface Candidate {
  player: PlayerOut;
  state: SquadState;
}

/**
 * Klar first, then the shrugs, then the people nobody has heard from, and the
 * noes last — the order an admin reads the list in when picking six. It is a
 * reading order and nothing more: none of these four states picks anybody.
 */
export const SQUAD_STATES: SquadState[] = ["yes", "maybe", null, "no"];

export const SQUAD_STATE_TEXT: Record<string, string> = {
  yes: "text-win",
  maybe: "text-draw",
  no: "text-loss",
  none: "text-dim",
};

export const SQUAD_STATE_DOT: Record<string, string> = {
  yes: "bg-win",
  maybe: "bg-draw",
  no: "bg-loss",
  none: "bg-ink-500",
};

export function stateKey(state: SquadState): string {
  return state ?? "none";
}

/** Fixture wording throughout: Klar, Ikke klar, Ved ikke — and silence. */
export function squadStateLabel(state: SquadState): string {
  return state ? responseLabel(state, "match") : "Intet svar";
}

export function answersOf(event: EventDetailOut): Map<string, ResponseState> {
  return new Map(event.responses.map((row) => [row.player.id, row.state]));
}

/**
 * Everyone an admin can put on the team sheet.
 *
 * Built from the detail payload rather than the full roster query, because the
 * payload already carries exactly the right people: the members who answered,
 * the members who did not, and anyone else somebody has already picked. A
 * guest is on this list only because a member brought them to a date, which is
 * the same reason they are on the availability list.
 */
export function candidates(event: EventDetailOut): Candidate[] {
  const state = answersOf(event);
  const seen = new Set<string>();
  const people: Candidate[] = [];

  const add = (player: PlayerOut) => {
    if (seen.has(player.id)) return;
    seen.add(player.id);
    people.push({ player, state: state.get(player.id) ?? null });
  };

  event.responses.forEach((row) => add(row.player));
  event.unanswered.forEach(add);
  event.selected.forEach(add);

  return people.sort((a, b) => a.player.name.localeCompare(b.player.name, "da"));
}
