import { rating as formatRating, delta, recordLine } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One column of numbers. `rating` and `peak` are optional because the season
 * side of the profile does not have them: `GET /api/players/{id}` reports one
 * all-time rating plus per-season records, and a season rating would be a
 * number the API never claimed.
 */
export interface StatColumn {
  /** Placing among members — the ladder's own ranking. */
  rank: number | null;
  /**
   * The same placing over the whole field, guests included. Shown under the
   * members' placing, and only when the two differ.
   */
  rankWithGuests: number | null;
  rating?: number;
  rating_gained: number;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  peak?: number;
}

function Line({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone?: string;
  /** A second, quieter reading of the same measurement, under the value. */
  note?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[5px]">
      <span className="text-[11px] text-dim">{label}</span>
      <span className="min-w-0 text-right">
        <span className={cn("num block text-[13px] font-bold tabular-nums", tone ?? "text-chalk")}>
          {value}
        </span>
        {note ? (
          <span className="num mt-[1px] block truncate text-[9px] leading-none text-ink-500">
            {note}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * The placing, and under it the placing with guests counted — quieter, because
 * the ladder is the team's (docs/RATING.md, "Who appears on the ladder") and a
 * guest who turned up twice should not be what moves somebody's number.
 *
 * The second line only appears when the two differ, so a field with no guests
 * above the player says one thing once. A guest's own profile has no members'
 * placing at all: they are being measured, not ranked against the team.
 */
function placingLines(stats: StatColumn): { value: string; note?: string } {
  const withGuests =
    stats.rankWithGuests !== null && stats.rankWithGuests !== stats.rank
      ? `nr. ${stats.rankWithGuests} med gæster`
      : undefined;
  return { value: stats.rank === null ? "–" : `nr. ${stats.rank}`, note: withGuests };
}

function Column({
  title,
  caption,
  stats,
  accent,
  gainLabel = "Vundet",
}: {
  title: string;
  caption: string;
  stats: StatColumn | null;
  accent: boolean;
  /**
   * What the rating movement is called in this column. The season board ranks
   * by exactly this number, so the season column names it the same way its
   * caption does — "Placering" on its own reads as a placing by rating, which
   * is not what a season rank is.
   */
  gainLabel?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-card border px-3 py-2.5",
        accent ? "border-volt/25 bg-volt/[0.05]" : "border-line-soft bg-ink-850/60",
      )}
    >
      <p className={cn("eyebrow", accent ? "text-volt/80" : "text-mute")}>{title}</p>
      <p className="mt-0.5 truncate text-[10px] text-dim">{caption}</p>

      {stats === null || stats.matches === 0 ? (
        <p className="py-4 text-center text-[11px] text-dim">Ingen kampe endnu.</p>
      ) : (
        <div className="mt-2 divide-y divide-line-soft">
          <Line label="Placering" {...placingLines(stats)} />
          {stats.rating !== undefined ? (
            <Line label="Rating" value={formatRating(stats.rating)} />
          ) : null}
          <Line
            label={gainLabel}
            value={delta(stats.rating_gained, 0)}
            tone={
              stats.rating_gained > 0.05
                ? "text-win"
                : stats.rating_gained < -0.05
                  ? "text-loss"
                  : "text-flat"
            }
          />
          <Line label="V–N–U" value={recordLine(stats.wins, stats.losses, stats.draws)} />
          <Line label="Kampe" value={String(stats.matches)} />
          {stats.peak !== undefined ? <Line label="Top" value={formatRating(stats.peak)} /> : null}
        </div>
      )}
    </div>
  );
}

/**
 * All-time and season, side by side. The all-time rating never resets.
 *
 * The two "Placering" lines are not the same measurement. All-time is a
 * placing by rating; a season placing is by rating gained inside the season,
 * which is what STIGEN ranks by in season mode. The season column says so in
 * its caption and calls the number the rank is built on "Fremgang", because
 * a rank whose basis is unstated is a rank that gets read as the wrong one.
 */
export function StatColumns({
  allTime,
  season,
  seasonName,
}: {
  allTime: StatColumn;
  season: StatColumn | null;
  seasonName: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Column title="All-time" caption="Placering efter rating" stats={allTime} accent={false} />
      <Column
        title={seasonName}
        caption="Placering efter fremgang"
        stats={season}
        accent
        gainLabel="Fremgang"
      />
    </div>
  );
}
