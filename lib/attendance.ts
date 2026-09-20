/**
 * Who turned up tonight, remembered on the phone that is writing the scores.
 *
 * The API has no session roster — an evening is its matches and nothing else
 * (docs/ARCHITECTURE.md) — and a table for a list that only has to survive a
 * reload would be a migration against production for a scrolling problem. So
 * the roster lives in `localStorage` under the session id: the entry screen
 * asks once, and every line-up after that is picked from the people who are
 * actually at the hall.
 *
 * It is a convenience, never a source of truth. Nothing reads it to decide who
 * played — that is still the matches — and losing it costs one tap on "Ret
 * fremmødte".
 */

const PREFIX = "rammeslag:fremmoedte:";

/** The stored roster, or null when this phone has not been asked yet. */
export function readAttendance(sessionId: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + sessionId);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.every((id) => typeof id === "string") ? (parsed as string[]) : null;
  } catch {
    // Unreadable or storage turned off: the screen asks again, which is the
    // same thing it does on a phone that has never seen this evening.
    return null;
  }
}

export function writeAttendance(sessionId: string, ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + sessionId, JSON.stringify(ids));
  } catch {
    // Private mode, full quota: the evening is still perfectly enterable, it
    // just asks who is here again after a reload.
  }
}
