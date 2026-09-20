import Link from "next/link";
import type { PlayerDeltaOut, RecapOut } from "@/lib/types";
import { Delta } from "@/components/ui/delta";
import { standingOf, type SessionStanding } from "@/lib/session-stats";
import { matchCount, recordLine } from "@/lib/format";
import { cn } from "@/lib/utils";

function HighlightCard({
  highlight,
  standing,
  label,
  tone,
  icon,
}: {
  highlight: PlayerDeltaOut;
  /** The evening's record for this player, so the claim carries its sample. */
  standing: SessionStanding | null;
  label: string;
  tone: "up" | "down";
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={`/players/${highlight.player_id}`}
      className={cn(
        "card animate-rise relative overflow-hidden p-3",
        tone === "up" ? "border-win/25" : "border-loss/25",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full blur-2xl",
          tone === "up" ? "bg-win/20" : "bg-loss/20",
        )}
      />
      <div className="relative flex items-center gap-1.5">
        <span className={tone === "up" ? "text-win" : "text-loss"}>{icon}</span>
        <span className={cn("eyebrow", tone === "up" ? "text-win/80" : "text-loss/80")}>{label}</span>
      </div>
      {/* The whole name, not the given one. Two cards across a 390px screen
          leave about 150px, which a long name fills exactly — hence 14px. */}
      <p className="relative mt-2 truncate text-[14px] font-extrabold leading-tight tracking-tight">
        {highlight.name}
      </p>
      <p className="relative mt-1">
        <Delta value={highlight.delta} className="text-stat" />
      </p>
      <p className="num relative mt-1 text-[10px] text-dim">
        {standing
          ? `${recordLine(standing.wins, standing.losses, standing.draws)} · ${matchCount(standing.matches)}`
          : `rating ${Math.round(highlight.rating)}`}
      </p>
    </Link>
  );
}

function Rocket() {
  return (
    <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" aria-hidden>
      <path d="M2 10l1.6-.4M2.4 7.6l-.4 1.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path
        d="M4.4 8.2C3 6.8 5.6 2 9.8 1.4c.6 4.2-4.2 6.8-5.4 6.8z"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
        strokeLinejoin="round"
      />
      <circle cx="7.6" cy="4" r="1" fill="currentColor" />
    </svg>
  );
}

function FallArrow() {
  return (
    <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" aria-hidden>
      <path d="M6 1.8v8.4M2.8 7l3.2 3.2L9.2 7" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The part that gets screenshotted into the group chat. */
export function Recap({
  recap,
  standings,
}: {
  recap: RecapOut;
  standings: SessionStanding[];
}) {
  if (!recap.biggest_riser && !recap.biggest_faller) return null;

  return (
    <section className="mt-5">
      <div className="flex items-center gap-2 px-1 pb-2">
        <span className="h-3 w-[3px] rounded-full bg-volt" aria-hidden />
        <h2 className="eyebrow text-mute">Aftenens opsamling</h2>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {recap.biggest_riser ? (
          <HighlightCard
            highlight={recap.biggest_riser}
            standing={standingOf(standings, recap.biggest_riser.player_id)}
            label="Raket"
            tone="up"
            icon={<Rocket />}
          />
        ) : null}
        {recap.biggest_faller ? (
          <HighlightCard
            highlight={recap.biggest_faller}
            standing={standingOf(standings, recap.biggest_faller.player_id)}
            label="Fald"
            tone="down"
            icon={<FallArrow />}
          />
        ) : null}
      </div>
    </section>
  );
}
