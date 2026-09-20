import Link from "next/link";
import type { CSSProperties } from "react";
import type { LadderEntryOut } from "@/lib/types";
import { FormDots } from "@/components/ui/form-dots";
import { Movement } from "@/components/ui/movement";
import { ProvisionalMark } from "@/components/ladder/provisional-mark";
import { rating as formatRating, delta, firstName, recordLine } from "@/lib/format";

/**
 * The deep end of the warm zone, and the last MEMBER on the ladder — a guest
 * who turned up once cannot inherit the title (docs/RATING.md: guests are here
 * to be measured, members are the team).
 *
 * It is the same row as everybody else's, one line taller: the bottom four
 * rows are already tinted, so nothing here has to shout.
 * The joke is the position, never the person, and the ribbing is warm enough
 * to be read out loud in the group chat.
 */
const ROASTS = [
  "Holder bunden varm for os alle.",
  "Stigens fundament. Bærende.",
  "Betaler banelejen i sjæl.",
  "Alle andre skal jo slå nogen.",
  "Sidst på stigen, først ved baren.",
  "Herfra går det kun opad.",
  "Har samlet flest bolde i år.",
];

function roastFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return ROASTS[hash % ROASTS.length];
}

function Plug({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <path d="M27 12c3-1 5-3 5-6" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <circle cx="31" cy="4" r="2.4" stroke="currentColor" strokeWidth="2.2" fill="none" />
      <ellipse cx="18" cy="21" rx="14" ry="9" stroke="currentColor" strokeWidth="2.4" fill="none" />
      <circle cx="18" cy="21" r="2.6" fill="currentColor" />
    </svg>
  );
}

export function BundpropRow({
  entry,
  seasonMode,
  threshold,
  above,
  zoneDepth = 1,
  innerRef,
}: {
  entry: LadderEntryOut;
  seasonMode: boolean;
  /** Career matches below which the rating is still settling. */
  threshold: number;
  /** The member one rung up — the distance to daylight is the funny part. */
  above: LadderEntryOut | null;
  /** 0..1, how deep into the warm zone this ROW sits. See lib/zones.ts. */
  zoneDepth?: number;
  innerRef?: (node: HTMLElement | null) => void;
}) {
  const number = seasonMode ? delta(entry.rating_gained, 0) : formatRating(entry.rating);
  const careerRecord = recordLine(entry.career_wins, entry.career_losses, entry.career_draws);
  const gap = above
    ? Math.round(
        seasonMode ? above.rating_gained - entry.rating_gained : above.rating - entry.rating,
      )
    : null;

  return (
    <Link
      ref={innerRef as never}
      href={`/players/${entry.player_id}`}
      // The same tint as the rows above, at whatever strength its position
      // earns: the bundprop is where the zone ends, not a separate box. With
      // guests on, a visitor can rank below them — then the gradient ends
      // further down and this row is no longer its deepest point. The badge
      // stays either way, because the title is the last MEMBER's.
      style={{ "--zone": zoneDepth } as CSSProperties}
      className="zone-bottom animate-rise relative block overflow-hidden rounded-row bg-ink-850/70 transition-colors active:bg-ink-800"
    >
      <div className="flex items-center gap-2 px-2.5 pb-1 pt-2.5">
        <span className="num-tight w-5 shrink-0 text-right text-[15px] font-bold tabular-nums text-bund/80">
          {entry.rank}
        </span>

        <span className="flex w-4 shrink-0 justify-center">
          <Movement movement={entry.movement} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-[14px] font-bold tracking-tight">{entry.name}</span>
            {entry.provisional ? (
              <ProvisionalMark careerMatches={entry.career_matches} threshold={threshold} />
            ) : null}
          </span>
          {/* The same career record every other row carries. Being last is not
              a reason to drop the line that says what the season actually was. */}
          <span className="num mt-0.5 block truncate text-[9px] leading-none tabular-nums text-dim">
            {careerRecord}
          </span>
        </span>

        <FormDots form={entry.form} className="shrink-0" />

        <span className="flex w-[60px] shrink-0 flex-col items-end">
          <span className="num-tight text-stat-sm font-black text-bund">{number}</span>
          <span className="num text-[9px] leading-none text-dim">
            {entry.matches_played} {entry.matches_played === 1 ? "kamp" : "kampe"}
          </span>
        </span>
      </div>

      <div className="flex items-center gap-2 px-2.5 pb-2.5 pt-0.5">
        <span className="inline-flex shrink-0 items-center gap-1 rounded-[4px] border border-bund/35 bg-bund/10 px-1.5 py-[2px] text-[9px] font-black tracking-[0.14em] text-bund/90">
          <Plug className="h-[10px] w-[10px] shrink-0" />
          BUNDPROP
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] italic text-bund/70">
          {roastFor(entry.player_id)}
        </span>
        {gap !== null && above ? (
          <span className="num shrink-0 text-[10px] text-dim">
            {gap} op til {firstName(above.name)}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
