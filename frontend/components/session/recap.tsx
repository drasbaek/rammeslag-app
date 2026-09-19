import Link from "next/link";
import type { PlayerDeltaOut, RecapOut } from "@/lib/types";
import { Delta } from "@/components/ui/delta";
import { standingOf, type SessionStanding } from "@/lib/session-stats";
import { firstName, recordLine } from "@/lib/format";
import { cn } from "@/lib/utils";

const BUND_ROASTS = [
  "Holdt bunden varm hele aftenen.",
  "Bar bolde, ære og nederlag hjem.",
  "Var der. Det tæller også for noget.",
  "Betalte banelejen i sjæl i aften.",
  "Alle andre skulle jo slå nogen.",
];

function roastFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return BUND_ROASTS[hash % BUND_ROASTS.length];
}

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
      <p className="relative mt-2 truncate text-[15px] font-extrabold tracking-tight">
        {firstName(highlight.name)}
      </p>
      <p className="relative mt-1">
        <Delta value={highlight.delta} className="text-stat" />
      </p>
      <p className="num relative mt-1 text-[10px] text-dim">
        {standing
          ? `${recordLine(standing.wins, standing.losses, standing.draws)} · ${standing.matches} kampe`
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

function BundpropStrip({
  highlight,
  standing,
}: {
  highlight: PlayerDeltaOut;
  standing: SessionStanding | null;
}) {
  return (
    <Link
      href={`/players/${highlight.player_id}`}
      className="bund-grain animate-rise mt-2 block overflow-hidden rounded-card border border-loss/25"
    >
      <div className="hazard h-[5px] w-full opacity-70" aria-hidden />
      <div className="flex items-center gap-3 px-3 py-3">
        <svg viewBox="0 0 34 30" className="h-8 w-9 shrink-0" aria-hidden>
          <path d="M24 10c3-1 5-3 5-6" stroke="var(--color-loss)" strokeWidth="1.3" fill="none" opacity="0.7" strokeLinecap="round" />
          <circle cx="29" cy="3" r="1.8" stroke="var(--color-loss)" strokeWidth="1.3" fill="none" opacity="0.7" />
          <ellipse cx="15" cy="22" rx="13" ry="8" fill="var(--color-loss)" opacity="0.16" />
          <ellipse cx="15" cy="19" rx="13" ry="8" stroke="var(--color-loss)" strokeWidth="1.5" fill="#140b10" />
          <ellipse cx="15" cy="19" rx="7" ry="4.2" stroke="var(--color-loss)" strokeWidth="1.1" fill="none" opacity="0.6" />
        </svg>

        <div className="min-w-0 flex-1">
          <span className="inline-block rounded-[4px] bg-loss px-1.5 py-[2px] text-[9px] font-black tracking-[0.16em] text-ink-950">
            AFTENENS BUNDPROP
          </span>
          <p className="mt-1.5 truncate text-[16px] font-extrabold tracking-tight">{highlight.name}</p>
          <p className="truncate text-[11px] italic text-loss/80">{roastFor(highlight.player_id)}</p>
        </div>

        <div className="shrink-0 text-right">
          <Delta value={highlight.delta} className="text-stat-sm" />
          <p className="num mt-0.5 text-[10px] text-dim">
            {standing
              ? `${recordLine(standing.wins, standing.losses, standing.draws)} · ${standing.matches} kampe`
              : `rating ${Math.round(highlight.rating)}`}
          </p>
        </div>
      </div>
    </Link>
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
  if (!recap.biggest_riser && !recap.biggest_faller && !recap.bundprop) return null;

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

      {recap.bundprop ? (
        <BundpropStrip
          highlight={recap.bundprop}
          standing={standingOf(standings, recap.bundprop.player_id)}
        />
      ) : null}
    </section>
  );
}
