import Link from "next/link";
import type { CSSProperties } from "react";
import type { LadderEntryOut } from "@/lib/types";
import type { LadderZone } from "@/lib/zones";
import { FormDots } from "@/components/ui/form-dots";
import { Movement } from "@/components/ui/movement";
import { ProvisionalMark } from "@/components/ladder/provisional-mark";
import { rating as formatRating, delta, matchCount, recordLine } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One tight broadcast row. Rank 1 is taller and carries the accent; everyone
 * else is a flat line so the eye can run down the numbers — which it has to,
 * because ranks 2 through 7 are separated by single points.
 *
 * The leader's rating is the biggest numeral on the ladder, but not so big
 * that it eats the row: at `text-stat` the form strip fits beside it, and the
 * player at the top is the one whose last five matches everybody wants to see.
 *
 * Rows in the top or bottom zone carry a tint whose strength is `zoneDepth`
 * (see `.zone-top` / `.zone-bottom` in globals.css). The leader opts out: they
 * already have the accent gradient, and the zone would double it.
 */
export function LadderRow({
  entry,
  seasonMode,
  threshold,
  innerRef,
  index,
  zone = null,
  zoneDepth = 0,
}: {
  entry: LadderEntryOut;
  seasonMode: boolean;
  /** Career matches below which the rating is still settling. */
  threshold: number;
  innerRef?: (node: HTMLElement | null) => void;
  index: number;
  /** Which end of the table this row sits at, or null for the neutral middle. */
  zone?: LadderZone;
  /** 0..1, how deep into that zone. Drives the tint, nothing else. */
  zoneDepth?: number;
}) {
  const leader = entry.rank === 1;
  const tinted = zone !== null && !leader;
  const careerRecord = recordLine(entry.career_wins, entry.career_losses, entry.career_draws);
  const number = seasonMode ? delta(entry.rating_gained, 0) : formatRating(entry.rating);
  const numberTone = seasonMode
    ? entry.rating_gained > 0.05
      ? "text-win"
      : entry.rating_gained < -0.05
        ? "text-loss"
        : "text-flat"
    : leader
      ? "text-volt"
      : entry.provisional
        ? "text-mute"
        : "text-chalk";

  return (
    <Link
      ref={innerRef as never}
      href={`/players/${entry.player_id}`}
      style={
        {
          animationDelay: `${Math.min(index, 12) * 22}ms`,
          ...(tinted ? { "--zone": zoneDepth } : null),
        } as CSSProperties
      }
      className={cn(
        "animate-rise relative flex items-center gap-2.5 overflow-hidden rounded-row border px-3 transition-colors",
        leader
          ? "h-[72px] border-volt/25 bg-[linear-gradient(100deg,rgba(0,229,255,0.10),rgba(0,229,255,0)_58%),linear-gradient(180deg,var(--color-ink-800),var(--color-ink-850))]"
          : "h-[52px] border-transparent bg-ink-850/70 active:bg-ink-800",
        tinted ? (zone === "top" ? "zone-top" : "zone-bottom") : "",
      )}
    >
      {leader ? <span className="absolute inset-y-0 left-0 w-[3px] bg-volt" aria-hidden /> : null}

      <span
        className={cn(
          "num-tight w-5 shrink-0 text-right font-bold tabular-nums",
          leader
            ? "text-[22px] text-volt"
            : cn(
                "text-[15px]",
                // The rank numeral carries the zone colour too, so the tint is
                // legible in the column the eye actually runs down.
                tinted ? (zone === "top" ? "text-volt/55" : "text-bund/70") : "text-dim",
              ),
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
          {entry.is_guest ? (
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
              leader ? "text-[16px]" : entry.is_guest ? "text-[13px]" : "text-body",
              entry.is_guest ? "text-mute" : "",
            )}
          >
            {entry.name}
          </span>
          {entry.provisional ? (
            <ProvisionalMark careerMatches={entry.career_matches} threshold={threshold} />
          ) : null}
        </span>
        {/* The all-time record, quietly. It reads the career fields, not the
            scoped ones, so a season board still shows who somebody is rather
            than what they did since August. The leader says the same thing in
            volt: the form strip took the width the match count used to have,
            and a W-L record carries its own sample size. */}
        {leader ? (
          <span className="num mt-1 block truncate text-[9px] font-bold tracking-[0.08em] text-volt/70">
            FØRER · {careerRecord}
          </span>
        ) : (
          <span className="num mt-0.5 block truncate text-[9px] leading-none tabular-nums text-dim">
            {careerRecord}
          </span>
        )}
      </span>

      {/* Every row carries its form strip, the leader included. The name is
          what gives way at 390px, and a truncated name costs less than a
          missing week of results. */}
      <FormDots form={entry.form} className="shrink-0" />

      {/* Wide enough for a four-digit rating at this size: a numeral that
          overflows its own column lands in the form strip's lap. */}
      <span className={cn("flex shrink-0 flex-col items-end", leader ? "w-[74px]" : "w-[60px]")}>
        <span className={cn("num-tight font-black", leader ? "text-stat" : "text-stat-sm", numberTone)}>
          {number}
        </span>
        <span className="num text-[9px] leading-none text-dim">
          {leader && !seasonMode
            ? `${delta(entry.rating_gained, 0)} i alt`
            : matchCount(entry.matches_played)}
        </span>
      </span>
    </Link>
  );
}
