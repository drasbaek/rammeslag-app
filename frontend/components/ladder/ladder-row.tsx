import Link from "next/link";
import type { LadderEntry } from "@/lib/types";
import { FormDots } from "@/components/ui/form-dots";
import { Movement } from "@/components/ui/movement";
import { ProvisionalMark } from "@/components/ladder/provisional-mark";
import { rating as formatRating, delta, recordLine } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One tight broadcast row. Rank 1 is taller and carries the accent; everyone
 * else is a flat line so the eye can run down the numbers — which it has to,
 * because ranks 2 through 7 are separated by single points.
 */
export function LadderRow({
  entry,
  seasonMode,
  innerRef,
  index,
}: {
  entry: LadderEntry;
  seasonMode: boolean;
  innerRef?: (node: HTMLElement | null) => void;
  index: number;
}) {
  const leader = entry.rank === 1;
  const number = seasonMode ? delta(entry.rating_gained, 0) : formatRating(entry.rating);
  const numberTone = seasonMode
    ? entry.rating_gained > 0.05
      ? "text-win"
      : entry.rating_gained < -0.05
        ? "text-loss"
        : "text-draw"
    : leader
      ? "text-volt"
      : entry.provisional
        ? "text-mute"
        : "text-chalk";

  return (
    <Link
      ref={innerRef as never}
      href={`/players/${entry.player.id}`}
      style={{ animationDelay: `${Math.min(index, 12) * 22}ms` }}
      className={cn(
        "animate-rise relative flex items-center gap-2.5 overflow-hidden rounded-row border px-3 transition-colors",
        leader
          ? "h-[72px] border-volt/25 bg-[linear-gradient(100deg,rgba(0,229,255,0.10),rgba(0,229,255,0)_58%),linear-gradient(180deg,var(--color-ink-800),var(--color-ink-850))]"
          : "h-[52px] border-transparent bg-ink-850/70 active:bg-ink-800",
      )}
    >
      {leader ? <span className="absolute inset-y-0 left-0 w-[3px] bg-volt" aria-hidden /> : null}

      <span
        className={cn(
          "num-tight w-5 shrink-0 text-right font-bold tabular-nums",
          leader ? "text-[22px] text-volt" : "text-[15px] text-dim",
        )}
      >
        {entry.rank}
      </span>

      <span className="flex w-4 shrink-0 justify-center">
        <Movement movement={entry.movement} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {/* A one-letter mark, not the word: at 390px the word GÆST costs
              four characters of somebody's actual name. */}
          {entry.player.is_guest ? (
            <span
              className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border border-ink-500 text-[9px] font-black text-dim"
              title="Gæst"
              aria-label="Gæst"
            >
              G
            </span>
          ) : null}
          <span
            className={cn(
              "min-w-0 truncate font-bold tracking-tight",
              leader ? "text-[17px]" : entry.player.is_guest ? "text-[13px]" : "text-body",
              entry.player.is_guest ? "text-mute" : "",
            )}
          >
            {entry.player.name}
          </span>
          {entry.provisional ? <ProvisionalMark matchesPlayed={entry.matches_played} /> : null}
        </span>
        {leader ? (
          <span className="num mt-1 block truncate text-[9px] font-bold tracking-[0.08em] text-volt/70">
            FØRER · {recordLine(entry.wins, entry.losses, entry.draws)} · {entry.matches_played} KAMPE
          </span>
        ) : null}
      </span>

      {/* The leader trades their form strip for the biggest numeral on the
          ladder. Five dots and a 44px number do not both fit at 390px, and
          the number is the point. */}
      {leader ? null : <FormDots form={entry.form} className="shrink-0" />}

      <span className={cn("flex shrink-0 flex-col items-end", leader ? "" : "w-[60px]")}>
        <span className={cn("num-tight font-black", leader ? "text-hero" : "text-stat-sm", numberTone)}>
          {number}
        </span>
        <span className="num text-[9px] leading-none text-dim">
          {leader && !seasonMode
            ? `${delta(entry.rating_gained, 0)} i alt`
            : `${entry.matches_played} ${entry.matches_played === 1 ? "kamp" : "kampe"}`}
        </span>
      </span>
    </Link>
  );
}
