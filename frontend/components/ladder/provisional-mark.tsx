import { PROVISIONAL_MATCHES } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * A player under PROVISIONAL_MATCHES keeps their rank — docs/RATING.md is
 * explicit that there is no waiting room. All they get is this: a half-drawn
 * ring next to the name and a muted rating, meaning "this number is still
 * settling". The match count always travels with it, because a claim without
 * its sample size is a claim the app cannot back up.
 */
export function ProvisionalMark({
  matchesPlayed,
  className,
}: {
  matchesPlayed: number;
  className?: string;
}) {
  const left = Math.max(0, PROVISIONAL_MATCHES - matchesPlayed);

  return (
    <span
      className={cn("inline-flex shrink-0 items-center text-volt/55", className)}
      title={`Ratingen sætter sig endnu — ${matchesPlayed} ${
        matchesPlayed === 1 ? "kamp" : "kampe"
      }, ${left} igen`}
      aria-label={`Ratingen sætter sig endnu, ${matchesPlayed} kampe spillet`}
    >
      <svg viewBox="0 0 12 12" className="h-[11px] w-[11px]" aria-hidden>
        <circle
          cx="6"
          cy="6"
          r="4.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="2.2 2.6"
        />
        <circle cx="6" cy="6" r="1.4" fill="currentColor" />
      </svg>
    </span>
  );
}

/** The same idea, spelled out, for places with room for a sentence. */
export function ProvisionalNote({ matchesPlayed }: { matchesPlayed: number }) {
  const left = Math.max(0, PROVISIONAL_MATCHES - matchesPlayed);
  return (
    <span className="text-[10px] text-volt/60">
      Ratingen sætter sig endnu · {left} {left === 1 ? "kamp" : "kampe"} igen
    </span>
  );
}
