import type { SeasonCreate, SeasonOut } from "@/lib/types";

/**
 * Season helpers for the admin screen.
 *
 * A session cannot exist outside a season (docs/ARCHITECTURE.md), so the one
 * job of this file is to make the next season a two-tap job rather than a
 * date-picker exercise. The backend owns the truth; nothing here guesses on
 * anybody's behalf without showing the dates first.
 */

/** Today in Copenhagen, as the ISO date the API speaks. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(now);
}

/** Is this date inside the season? Both ends are inclusive. */
export function covers(season: SeasonOut, date: string): boolean {
  return season.starts_on <= date && date <= season.ends_on;
}

/** The season that contains the date, if any season does. */
export function seasonFor(seasons: SeasonOut[], date: string): SeasonOut | null {
  return seasons.find((season) => covers(season, date)) ?? null;
}

function half(year: number, second: boolean): SeasonCreate {
  return second
    ? { name: `Efterår ${year}`, starts_on: `${year}-08-01`, ends_on: `${year}-12-31` }
    : { name: `Forår ${year}`, starts_on: `${year}-01-01`, ends_on: `${year}-07-31` };
}

/**
 * The half-year the date falls in, and the one after it. Two blocks that tile
 * the calendar, so following the suggestion never leaves a gap for a training
 * evening to fall into.
 */
export function seasonSuggestions(date: string): SeasonCreate[] {
  const year = Number(date.slice(0, 4));
  const second = Number(date.slice(5, 7)) >= 8;
  return [half(year, second), second ? half(year + 1, false) : half(year, true)];
}

/** "1. aug 2026 – 31. dec 2026" */
export function seasonRange(season: { starts_on: string; ends_on: string }): string {
  const fmt = new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Copenhagen",
  });
  // da-DK writes "1. aug. 2026"; the month's abbreviation dot goes, the
  // ordinal dot on the day stays.
  const at = (value: string) =>
    fmt.format(new Date(`${value}T12:00:00+02:00`)).replace(/(\p{L})\./u, "$1");
  return `${at(season.starts_on)} – ${at(season.ends_on)}`;
}
