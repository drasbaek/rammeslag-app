import Link from "next/link";
import type { CSSProperties } from "react";
import type { SessionStanding } from "@/lib/session-stats";
import { Delta } from "@/components/ui/delta";
import { recordLine } from "@/lib/format";
import { zoneMarks } from "@/lib/zones";
import { cn } from "@/lib/utils";

/**
 * Every player's rating movement across the evening, as a centre-out bar.
 * The list is sorted best first, so it gets the ladder's zone tint: the
 * evening has a top and a bottom too, and they are shaded, not fenced off.
 */
export function MovementBars({ standings }: { standings: SessionStanding[] }) {
  if (standings.length === 0) return null;
  const max = Math.max(...standings.map((s) => Math.abs(s.delta)), 1);
  const zones = zoneMarks(standings.length, 3);

  return (
    <section className="mt-6">
      <div className="flex items-center gap-2 px-1 pb-2">
        <span className="h-3 w-[3px] rounded-full bg-volt" aria-hidden />
        <h2 className="eyebrow text-mute">Bevægelse i aften</h2>
      </div>

      <div className="rounded-card border border-line-soft bg-ink-850/60 px-3 py-2">
        {standings.map((row, index) => {
          const width = (Math.abs(row.delta) / max) * 50;
          const up = row.delta >= 0;
          const mark = zones[index];
          return (
            <Link
              key={row.player_id}
              href={`/players/${row.player_id}`}
              style={{ ...(mark ? { "--zone": mark.depth * 0.7 } : null) } as CSSProperties}
              className={cn(
                "-mx-3 flex items-center gap-2 px-3 py-1.5",
                mark ? (mark.zone === "top" ? "zone-top" : "zone-bottom") : "",
              )}
            >
              {/* Whole names, so the column flexes and the bar is the fixed
                  one. A bar is readable at 88px; a name is not readable at
                  74px. */}
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-mute">
                {row.name}
              </span>
              <span className="relative h-3 w-[88px] shrink-0">
                <span className="absolute inset-y-0 left-1/2 w-px bg-ink-600" aria-hidden />
                <span
                  className={cn(
                    "absolute inset-y-[3px] rounded-[2px]",
                    up ? "left-1/2 bg-win/70" : "right-1/2 bg-loss/70",
                  )}
                  style={{ width: `${Math.max(width, 1.5)}%` }}
                />
              </span>
              <span className="num w-[42px] shrink-0 text-right text-[10px] text-dim">
                {recordLine(row.wins, row.losses, row.draws)}
              </span>
              <Delta value={row.delta} className="w-[48px] shrink-0 text-right text-[12px]" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
