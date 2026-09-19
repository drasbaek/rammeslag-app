import Link from "next/link";
import type { LadderEntry } from "@/lib/types";
import { FormDots } from "@/components/ui/form-dots";
import { Movement } from "@/components/ui/movement";
import { ProvisionalMark } from "@/components/ladder/provisional-mark";
import { rating as formatRating, recordLine, delta, firstName } from "@/lib/format";

/**
 * The most-looked-at slot in the app, and the last MEMBER on the ladder — a
 * guest who turned up once cannot inherit the title (docs/RATING.md: guests
 * are here to be measured, members are the team).
 *
 * Hazard tape, an outlined rank numeral, a dangling plug and a roast.
 * Affectionate, never cruel: the joke is the position, never the person.
 */
const ROASTS = [
  "Nogen skal holde bunden varm.",
  "Stigens fundament. Bogstaveligt talt.",
  "Betaler banelejen i sjæl.",
  "Uundværlig — alle andre skal jo slå nogen.",
  "Har samlet flest bolde i år.",
  "Sidst på stigen, først ved baren.",
  "Bunden er også en plads. Den nederste.",
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

export function BundpropCard({
  entry,
  seasonMode,
  above,
  innerRef,
}: {
  entry: LadderEntry;
  seasonMode: boolean;
  /** The member one rung up — the distance to daylight is the funny part. */
  above: LadderEntry | null;
  innerRef?: (node: HTMLElement | null) => void;
}) {
  const number = seasonMode ? delta(entry.rating_gained, 0) : formatRating(entry.rating);
  const gap = above
    ? Math.round(
        seasonMode ? above.rating_gained - entry.rating_gained : above.rating - entry.rating,
      )
    : null;

  return (
    <Link
      ref={innerRef as never}
      href={`/players/${entry.player.id}`}
      className="bund-grain animate-rise relative mt-2 block overflow-hidden rounded-card border border-loss/25"
    >
      <div className="hazard h-[5px] w-full opacity-70" aria-hidden />

      <div className="relative flex items-center gap-2.5 px-3 py-3.5">
        {/* The rank, outlined and oversized: the number is the joke. */}
        <span
          className="num-tight outline-numeral w-[42px] shrink-0 select-none text-center text-[38px] font-black leading-none"
          aria-hidden
        >
          {entry.rank}
        </span>

        <div className="relative z-10 min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-1 rounded-[4px] bg-loss px-1.5 py-[2px] text-[9px] font-black tracking-[0.16em] text-ink-950">
              <Plug className="h-[11px] w-[11px] shrink-0" />
              BUNDPROP
            </span>
            <Movement movement={entry.movement} className="ml-auto" />
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-[17px] font-extrabold tracking-tight">
            <span className="min-w-0 truncate">{entry.player.name}</span>
            {entry.provisional ? <ProvisionalMark matchesPlayed={entry.matches_played} /> : null}
          </p>
          <p className="mt-0.5 truncate text-[11px] italic text-loss/80">
            {roastFor(entry.player.id)}
          </p>
        </div>

        <div className="relative z-10 flex shrink-0 flex-col items-end gap-1.5">
          <span className="num-tight text-stat font-black text-loss">{number}</span>
          <FormDots form={entry.form} />
          <span className="num text-[10px] text-dim">
            {recordLine(entry.wins, entry.losses, entry.draws)} · {entry.matches_played} kampe
          </span>
        </div>
      </div>

      {gap !== null && above ? (
        <div className="relative flex items-center gap-2 border-t border-loss/15 px-3 py-2">
          <span className="num text-[10px] font-black text-loss">{gap}</span>
          <span className="text-[10px] text-mute">
            point op til {firstName(above.player.name)}. Det er tre gode aftener.
          </span>
        </div>
      ) : null}
    </Link>
  );
}
