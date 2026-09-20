/**
 * Both ends of a standings table are tinted rather than any single row being
 * singled out: the top warms toward the leader, the bottom toward the
 * bundprop, and the middle is left alone. `.zone-top` / `.zone-bottom` in
 * globals.css draw it; `depth` is the only thing that varies.
 */

/** Which end of the table a row sits at. `null` is the neutral middle. */
export type LadderZone = "top" | "bottom" | null;

export interface ZoneMark {
  zone: Exclude<LadderZone, null>;
  /** 0..1 — how deep into the zone. 1 is the very top, or the very bottom. */
  depth: number;
}

/** How many rows each end claims when the field is full. */
export const ZONE_SIZE = 4;

/**
 * One mark per row, top to bottom. With a small field the two zones would
 * meet in the middle and the whole table would be tinted, which says nothing
 * — so the zones shrink, and below five rows there are none at all.
 *
 * The marks are POSITIONAL: index 0 is the top of the list and the last index
 * is the bottom of it, whoever is standing there. On the ladder that means the
 * warm end stays glued to the last four rows on screen when the guest toggle
 * drops fifteen visitors into the table, instead of trailing after the four
 * members who happened to be last with guests hidden. Being the bundprop is
 * still a members-only title — that is the badge, and this is the tint.
 */
export function zoneMarks(count: number, maxSize = ZONE_SIZE): (ZoneMark | null)[] {
  const marks: (ZoneMark | null)[] = Array.from({ length: count }, () => null);
  const size = Math.min(maxSize, Math.floor((count - 1) / 2));
  if (size < 2) return marks;

  for (let i = 0; i < size; i += 1) {
    marks[i] = { zone: "top", depth: (size - i) / size };
    marks[count - size + i] = { zone: "bottom", depth: (i + 1) / size };
  }
  return marks;
}
