/** Danish, hardcoded. There is no i18n layer and adding one is not an improvement. */

const TZ = "Europe/Copenhagen";

function toDate(value: string): Date {
  // Date-only strings are treated as local Copenhagen dates.
  return new Date(value.length === 10 ? `${value}T12:00:00+02:00` : value);
}

/**
 * "søndag 27. september" -> "Søndag 27. september".
 *
 * A JS helper rather than CSS: `capitalize` would upper-case the month too,
 * which Danish does not, and `::first-letter` does not apply to an inline
 * element.
 */
export function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatDateLong(value: string): string {
  return new Intl.DateTimeFormat("da-DK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ,
  }).format(toDate(value));
}

export function formatDateShort(value: string): string {
  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  }).format(toDate(value));
}

export function dayNumber(value: string): string {
  return new Intl.DateTimeFormat("da-DK", { day: "2-digit", timeZone: TZ }).format(toDate(value));
}

export function monthShort(value: string): string {
  return new Intl.DateTimeFormat("da-DK", { month: "short", timeZone: TZ })
    .format(toDate(value))
    .replace(".", "")
    .toUpperCase();
}

export function weekdayShort(value: string): string {
  return new Intl.DateTimeFormat("da-DK", { weekday: "short", timeZone: TZ })
    .format(toDate(value))
    .replace(".", "");
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(toDate(value));
}

/** 1043.2 -> "1043" */
export function rating(value: number): string {
  return Math.round(value).toString();
}

/** 12.4 -> "+12,4"; -3 -> "−3,0" (true minus sign, Danish decimal comma) */
export function delta(value: number, decimals = 1): string {
  const rounded = Number(value.toFixed(decimals));
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "±";
  const body = Math.abs(rounded).toFixed(decimals).replace(".", ",");
  return `${sign}${body}`;
}

/** Whole-number delta for the tightest rows. */
export function deltaShort(value: number): string {
  return delta(value, 0);
}

export function firstName(name: string): string {
  return name.split(" ")[0];
}

/**
 * A name split the way the team says it out loud: a given name and everything
 * after it. The surname carries the weight — "Hedegaard", not "Klaus" — which is
 * why the player picker stacks the two instead of truncating one line.
 * A single-word name has no surname, and gets `given: null` so the caller can
 * put the one word it has on the loud line.
 */
export function nameParts(name: string): { given: string | null; family: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return { given: null, family: parts[0] ?? name };
  return { given: parts.slice(0, -1).join(" "), family: parts[parts.length - 1] };
}

export function initials(name: string): string {
  const parts = name.replace(/\(.*\)/, "").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** "1 kamp", "6 kampe". The count is printed in half the screens in the app. */
export function matchCount(value: number): string {
  return `${value} ${value === 1 ? "kamp" : "kampe"}`;
}

export function recordLine(wins: number, losses: number, draws: number): string {
  return draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`;
}

/**
 * Every type the backend can store, not just the two the create sheet offers.
 * Old evenings carry "tournament" and "social" is reserved for a bødekasse
 * night, so the rendering side stays wider than the writing side.
 */
export const SESSION_TYPE_LABEL: Record<string, string> = {
  training: "Træning",
  casual: "Løst slag",
  social: "Socialt",
  tournament: "Turnering",
};

/** Never blank: an unknown type from a newer backend still reads as something. */
export function sessionTypeLabel(type: string): string {
  return SESSION_TYPE_LABEL[type] ?? "Session";
}

/* ---- Events -------------------------------------------------------------- */

export const EVENT_TYPE_LABEL: Record<string, string> = {
  match: "Kamp",
  training: "Træning",
};

/** Never blank: an unknown type from a newer backend still reads as something. */
export function eventTypeLabel(type: string): string {
  return EVENT_TYPE_LABEL[type] ?? "Begivenhed";
}

export const EVENT_STATUS_LABEL: Record<string, string> = {
  open: "Åben",
  locked: "Låst",
  cancelled: "Aflyst",
};

/**
 * "18:00:00" -> "18.00". Danish writes a period between hours and minutes,
 * and the seconds the API sends are never anything but zero.
 */
export function clock(value: string): string {
  return value.slice(0, 5).replace(":", ".");
}

/** "18:00:00" -> "18:00", which is what an <input type="time"> wants back. */
export function clockInput(value: string): string {
  return value.slice(0, 5);
}

/**
 * The two features answer the same question in different words. A fixture
 * borrows the old spreadsheet's wording exactly — Klar, Ikke klar, Ved ikke —
 * because that is what the team has been typing for a season. A Sunday is
 * plainer: you are coming or you are not.
 */
export function responseLabel(state: string, type: string): string {
  if (type === "training") {
    return { yes: "Kommer", no: "Kommer ikke", maybe: "Måske" }[state] ?? "Uafklaret";
  }
  return { yes: "Klar", no: "Ikke klar", maybe: "Ved ikke" }[state] ?? "Uafklaret";
}

/** Capacity back into baner, rounded up. Mirrors events/service.py courts_for. */
export function courtsFor(capacity: number): number {
  return Math.ceil(capacity / 4);
}

/** "3 baner", and "1 bane" for the Sunday somebody only got one. */
export function courtCount(capacity: number): string {
  const courts = courtsFor(capacity);
  return `${courts} ${courts === 1 ? "bane" : "baner"}`;
}

/**
 * How far off a full squad we are. `+4` is four spare, `−2` is two short.
 *
 * Deliberately not phrased as "vi er klar": this counts who said they are
 * available, which is not the same as who is playing. The screens that show
 * it say so in words next to it.
 */
export function surplus(value: number): string {
  if (value === 0) return "±0";
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}
