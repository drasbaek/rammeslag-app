import type { PlayerStats, Season } from "@/lib/types";
import { rating as formatRating, delta, recordLine } from "@/lib/format";
import { cn } from "@/lib/utils";

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
  showRating,
}: {
  title: string;
  caption: string;
  stats: PlayerStats | null;
  accent: boolean;
  showRating: boolean;
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

      {stats === null ? (
        <p className="py-4 text-center text-[11px] text-dim">Ingen kampe endnu.</p>
      ) : (
        <div className="mt-2 divide-y divide-line-soft">
          <Line label="Placering" value={stats.rank === null ? "–" : `nr. ${stats.rank}`} />
          {showRating ? <Line label="Rating" value={formatRating(stats.rating)} /> : null}
          <Line
            label="Vundet"
            value={delta(stats.rating_gained, 0)}
            tone={
              stats.rating_gained > 0.05
                ? "text-win"
                : stats.rating_gained < -0.05
                  ? "text-loss"
                  : "text-draw"
            }
          />
          <Line label="V–N–U" value={recordLine(stats.wins, stats.losses, stats.draws)} />
          <Line label="Kampe" value={String(stats.matches_played)} />
          <Line label="Top" value={formatRating(stats.peak_rating)} />
        </div>
      )}
    </div>
  );
}

/** All-time and season, side by side. The all-time rating never resets. */
export function StatColumns({
  allTime,
  season,
  currentSeason,
}: {
  allTime: PlayerStats;
  season: PlayerStats | null;
  currentSeason: Season | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Column
        title="All-time"
        caption="Siden første kamp"
        stats={allTime}
        accent={false}
        showRating
      />
      <Column
        title={currentSeason?.name ?? "Sæson"}
        caption="Ratingen nulstilles aldrig"
        stats={season}
        accent
        showRating={false}
      />
    </div>
  );
}
