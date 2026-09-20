import Link from "next/link";
import type { EventOut } from "@/lib/types";
import {
  clock,
  courtCount,
  dayNumber,
  eventTypeLabel,
  monthShort,
  surplus,
  weekdayShort,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A league fixture. Drawn in the same weight as the court mark below so the
 * two read as a pair of kinds rather than one decorated row.
 */
function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} role="img" aria-label="Kamp">
      <path
        d="M10 2.6l6 2.2v5.1c0 3.4-2.4 6.2-6 7.5-3.6-1.3-6-4.1-6-7.5V4.8z"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A Sunday: a court with a net, mirroring the padel mark on the "+" menu. */
function CourtIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} role="img" aria-label="Træning">
      <rect x="3" y="3.5" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M3 10h14M10 3.5v13" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/**
 * One thing that has not happened yet.
 *
 * Built from the same date block as a session row, so the two tabs feel like
 * one app, but it closes on the availability count rather than a match count —
 * an event has no matches, and the number people open this screen for is how
 * many have said yes.
 *
 * That number is `counts.yes`, and it is labelled KLAR, never something like
 * "spillere". Saying yes is availability. Who plays is decided by an admin and
 * lives on the detail screen under its own heading.
 *
 * A kamp and a træning are told apart by form, never by a second brand colour:
 * a glyph in front of the title, and a date block that is raised for a fixture
 * and flat for a Sunday. The palette has exactly one accent and the coloured
 * tokens in this row already mean something else — win/loss/draw is the
 * player's own answer, loss is also "we are short". A third meaning on any of
 * them would make the row a quiz.
 */
export function EventRow({ event, index }: { event: EventOut; index: number }) {
  const cancelled = event.status === "cancelled";
  const training = event.type === "training";
  // A training is only "short" once it cannot fill a single court. Below that
  // it is simply filling up, which is what a Sunday poll looks like all week.
  const short = !cancelled && (training ? event.counts.yes < 4 : event.surplus < 0);
  const mine = event.my_state;
  const label = cancelled
    ? training
      ? "TILMELDT"
      : "KLAR"
    : training
      ? "TILMELDT"
      : `KLAR ${surplus(event.surplus)}`;

  return (
    <Link
      href={`/program/${event.id}`}
      style={{ animationDelay: `${Math.min(index, 10) * 24}ms` }}
      className={cn(
        "animate-rise flex items-center gap-3 rounded-row border border-transparent bg-ink-850/70 px-3 py-2.5 transition-colors active:border-line active:bg-ink-800",
        cancelled && "opacity-55",
      )}
    >
      <div
        className={cn(
          "flex w-11 shrink-0 flex-col items-center rounded-[10px] border py-1.5",
          // The fixture's date is the one somebody else in another club also
          // has in their calendar, so it sits a step forward: brighter edge,
          // lighter fill. A Sunday stays flat. Weight, not hue.
          training ? "border-line bg-ink-900" : "border-ink-500 bg-ink-800",
        )}
      >
        <span className="num-tight text-[19px] font-black leading-none">
          {dayNumber(event.held_on)}
        </span>
        <span className="mt-0.5 text-[9px] font-bold tracking-[0.1em] text-dim">
          {monthShort(event.held_on)}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {/* The kind, before the name. An opponent already tells you it is a
              kamp once you know the opponent; the glyph tells you before you
              have read anything. */}
          {training ? (
            <CourtIcon className="h-3.5 w-3.5 shrink-0 text-mute" />
          ) : (
            <ShieldIcon className="h-3.5 w-3.5 shrink-0 text-mute" />
          )}
          <span className="truncate text-body font-bold tracking-tight">
            {/* A fixture is known by who we are playing; a Sunday has no
                opponent, so it is known by what it is. */}
            {event.opponent ?? eventTypeLabel(event.type)}
          </span>
          {cancelled ? (
            <span className="shrink-0 rounded-[3px] bg-loss/20 px-1.5 py-[1px] text-[9px] font-black tracking-[0.1em] text-loss">
              AFLYST
            </span>
          ) : mine ? (
            // Your own answer, as a dot. The full toggle is one tap away and
            // this row is not the place to change your mind by accident.
            <span
              aria-label="Dit svar er registreret"
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                mine === "yes" ? "bg-win" : mine === "no" ? "bg-loss" : "bg-draw",
              )}
            />
          ) : null}
        </div>
        <p className="mt-1 truncate text-[11px] text-dim">
          <span className="capitalize text-mute">{weekdayShort(event.held_on)}</span>
          {` ${clock(event.start_time)} · ${event.venue}`}
          {event.type === "training" ? ` · ${courtCount(event.capacity)}` : ""}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end">
        <span
          className={cn(
            "num-tight text-[19px] font-black leading-none",
            cancelled ? "text-dim" : short ? "text-loss" : "text-chalk",
          )}
        >
          {event.counts.yes}
          <span className="text-[13px] text-dim">/{event.capacity}</span>
        </span>
        <span
          className={cn(
            "mt-0.5 text-[9px] font-bold tracking-[0.1em]",
            short ? "text-loss" : "text-dim",
          )}
        >
          {/* A fixture is short or spare against a squad of six, so it carries
              the old sheet's ± number. A Sunday is just filling up, and
              "KLAR −6" would make six people sound like a problem rather than
              half a hall. This label is also the second thing telling the two
              kinds apart, after the glyph — which is why it stays a word and
              not an icon. */}
          {label}
        </span>
      </div>

      <svg viewBox="0 0 8 12" className="h-3 w-2 shrink-0 text-ink-500" aria-hidden>
        <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
    </Link>
  );
}
