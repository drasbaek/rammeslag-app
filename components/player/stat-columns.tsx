import { rating as formatRating, delta, recordLine } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One column of numbers. `rating` and `peak` are optional because the season
 * side of the profile does not have them: `GET /api/players/{id}` reports one
 * all-time rating plus per-season records, and a season rating would be a
 * number the API never claimed.
 */
export interface StatColumn {
  rank: number | null;
  rating?: number;
  rating_gained: number;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  peak?: number;
}

function Line({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[5px]">
      <span className="text-[11px] text-dim">{label}</span>
      <span className={cn("num text-[13px] font-bold tabular-nums", tone ?? "text-chalk")}>
        {value}
      </span>
    </div>
  );
}

function Column({
  title,
  caption,
  stats,
  accent,
}: {
  title: string;
  caption: string;
  stats: StatColumn | null;
  accent: boolean;
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
          <Line label="Placering" value={stats.rank === null ? "–" : `nr. ${stats.rank}`} />
          {stats.rating !== undefined ? (
            <Line label="Rating" value={formatRating(stats.rating)} />
          ) : null}
          <Line
            label="Vundet"
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

/** All-time and season, side by side. The all-time rating never resets. */
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
      <Column title="All-time" caption="Siden første kamp" stats={allTime} accent={false} />
      <Column
        title={seasonName}
        caption="Ratingen nulstilles aldrig"
        stats={season}
        accent
      />
    </div>
  );
}
