"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PlayerForm } from "@/components/admin/player-form";
import { EventForm } from "@/components/program/event-form";
import { useAuthGate } from "@/components/auth/auth-gate";
import { Sheet } from "@/components/ui/sheet";
import { useMe, useSessions } from "@/lib/queries";
import { formatDateLong, sentenceCase } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { SessionOut } from "@/lib/types";

interface QuickAdd {
  /** The "+" in the tab bar: asks what is being added. */
  openMenu: () => void;
}

const Context = createContext<QuickAdd | null>(null);

type Surface = null | "menu" | "choose" | "player" | "match" | "training";

/**
 * An evening you can type results into: a training whose kampe are set.
 *
 * Both halves matter. Open, because a closed evening is a finished report.
 * And planned, because an evening only exists at all once somebody has set
 * the kampe — so an open one with no plan is a training whose plan was wiped,
 * and there is nothing on it to enter a result for.
 */
function typeable(sessions: SessionOut[] | undefined): SessionOut[] {
  return (sessions ?? []).filter(
    (session) => session.status === "open" && session.planned_count > 0,
  );
}

/** "3 af 6 skrevet ind" — the only progress an evening has. */
function progressOf(session: SessionOut): string {
  return `${session.match_count} af ${session.planned_count} skrevet ind`;
}

function Row({
  title,
  hint,
  icon,
  disabled = false,
  onClick,
}: {
  title: string;
  hint: string;
  icon: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-card border border-line bg-ink-900 px-3 py-3 text-left transition-colors",
        disabled ? "opacity-45" : "active:border-volt/50 active:bg-volt/[0.06]",
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-volt/30 bg-volt/10 text-volt">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-bold tracking-tight">{title}</span>
        <span className="block truncate text-[11px] text-dim">{hint}</span>
      </span>
      <svg viewBox="0 0 8 12" className="h-3 w-2 shrink-0 text-ink-500" aria-hidden>
        <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
      <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path
        d="M4 16.5c0-3 2.7-5 6-5s6 2 6 5"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PadelIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
      <rect x="3" y="3.5" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M3 10h14M10 3.5v13" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
      <rect x="2.5" y="4" width="15" height="13.5" rx="2.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M2.5 8.5h15M6.5 2.5v3M13.5 2.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
      <path d="M10 2.6l6 2.2v5.1c0 3.4-2.4 6.2-6 7.5-3.6-1.3-6-4.1-6-7.5V4.8z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * One "+" for the whole app.
 *
 * The round button in the tab bar used to do exactly one thing, which stopped
 * being true the moment a second thing could be created. So it asks first: a
 * date, or a person. Anything added later is one more row here, and no new
 * button anywhere.
 *
 * What it no longer offers is an evening. This menu had both "ny
 * træningssession" and "ny træning", which were two names for the same Sunday
 * reached two ways — one of them skipping the calendar the rest of the team
 * answers in. An evening now comes from exactly one place: a træning whose
 * kampe have been set. The only thing left here for an evening in progress is
 * the way into it.
 */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const gate = useAuthGate();
  const router = useRouter();
  const me = useMe();
  const sessions = useSessions();
  const [surface, setSurface] = useState<Surface>(null);

  const openMenu = useCallback(() => {
    gate.requireAuth(() => setSurface("menu"));
  }, [gate]);

  const value = useMemo<QuickAdd>(() => ({ openMenu }), [openMenu]);

  // An evening already in progress is almost always what the "+" meant, so it
  // is the first row rather than something to go and find on the list. Two of
  // them is rare and entirely possible — a Sunday nobody finished typing in,
  // and tonight — and picking the wrong one puts a score on the wrong date,
  // so the row asks instead of guessing.
  const ongoing = typeable(sessions.data);
  const admin = me.data?.is_admin ?? false;

  const goToEntry = (sessionId: string) => {
    haptic("tap");
    setSurface(null);
    router.push(`/sessions/${sessionId}/entry`);
  };

  return (
    <Context.Provider value={value}>
      {children}

      <Sheet
        open={surface === "menu"}
        onOpenChange={(next) => setSurface(next ? "menu" : null)}
        title="Tilføj"
        description="Hvad skal der skrives ind?"
      >
        <div className="space-y-2">
          {ongoing.length > 0 ? (
            <Row
              title="Indtast resultater"
              hint={
                ongoing.length === 1
                  // Not sentence-cased: the weekday is not the first word
                  // here, and Danish writes "lørdag 19. september" mid-line.
                  ? `Træning · ${formatDateLong(ongoing[0].played_on)}`
                  : `${ongoing.length} træninger er i gang`
              }
              icon={<PadelIcon />}
              onClick={() => {
                if (ongoing.length === 1) {
                  goToEntry(ongoing[0].id);
                  return;
                }
                haptic("tap");
                setSurface("choose");
              }}
            />
          ) : null}

          {/* Forward-looking, all of it: a date in the calendar for people to
              answer. An evening with results in it is never created here — it
              is created by setting a træning's kampe, and there is exactly one
              way in. */}
          <Row
            title="Ny træning"
            hint={admin ? "Søndag, med baner" : "Kun administratorer"}
            icon={<CalendarIcon />}
            disabled={!admin}
            onClick={() => {
              haptic("tap");
              setSurface("training");
            }}
          />

          <Row
            title="Ny kamp"
            hint={admin ? "Modstander, sted og tid" : "Kun administratorer"}
            icon={<ShieldIcon />}
            disabled={!admin}
            onClick={() => {
              haptic("tap");
              setSurface("match");
            }}
          />

          <Row
            title="Ny spiller"
            hint={admin ? "Medlem eller gæst" : "Kun administratorer"}
            icon={<PersonIcon />}
            disabled={!admin}
            onClick={() => {
              haptic("tap");
              setSurface("player");
            }}
          />
        </div>
      </Sheet>

      {/* Which evening. Only ever on screen when there is more than one, and
          each row says how far through it is, because "2 af 6" is what tells
          two open Sundays apart. */}
      <Sheet
        open={surface === "choose"}
        onOpenChange={(next) => setSurface(next ? "choose" : null)}
        title="Hvilken træning?"
        description="Der er mere end én i gang."
      >
        <div className="space-y-2">
          {ongoing.map((session) => (
            <Row
              key={session.id}
              title={sentenceCase(formatDateLong(session.played_on))}
              hint={progressOf(session)}
              icon={<PadelIcon />}
              onClick={() => goToEntry(session.id)}
            />
          ))}
        </div>
      </Sheet>

      {/* Keyed so every opening starts on today's date with an empty note. */}
      {surface === "player" ? (
        <PlayerForm key="new-player" open onOpenChange={() => setSurface(null)} player={null} />
      ) : null}
      {surface === "match" ? (
        <EventForm key="new-match" open onOpenChange={() => setSurface(null)} type="match" />
      ) : null}
      {surface === "training" ? (
        <EventForm key="new-training" open onOpenChange={() => setSurface(null)} type="training" />
      ) : null}
    </Context.Provider>
  );
}

export function useQuickAdd(): QuickAdd {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useQuickAdd uden QuickAddProvider");
  return ctx;
}
