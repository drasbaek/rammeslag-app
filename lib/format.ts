/** Danish, hardcoded. There is no i18n layer and adding one is not an improvement. */

const TZ = "Europe/Copenhagen";

function toDate(value: string): Date {
  // Date-only strings are treated as local Copenhagen dates.
  return new Date(value.length === 10 ? `${value}T12:00:00+02:00` : value);
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

export const SESSION_TYPE_LABEL: Record<string, string> = {
  training: "Træning",
  casual: "Løst slag",
  social: "Socialt",
  tournament: "Turnering",
};
