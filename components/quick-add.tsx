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
import { SessionForm } from "@/components/session/session-form";
import { useAuthGate } from "@/components/auth/auth-gate";
import { Sheet } from "@/components/ui/sheet";
import { useMe, useSessions } from "@/lib/queries";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

interface QuickAdd {
  /** The "+" in the tab bar: asks what is being added. */
  openMenu: () => void;
  /** Straight to the create-session sheet, for the buttons that already say so. */
  openSession: () => void;
}

const Context = createContext<QuickAdd | null>(null);

type Surface = null | "menu" | "session" | "player" | "match" | "training";

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

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
      <path d="M10 3.5v13M3.5 10h13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
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
 * being true the moment a second thing could be created. So it asks first: an
 * evening, or a person. Anything added later is one more row here, and no new
 * button anywhere.
 *
 * The sheets live above the screens because more than one place opens them —
 * the tab bar and the session list both do — and a sheet that two screens each
 * own a copy of is a sheet that opens twice.
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

  const openSession = useCallback(() => {
    gate.requireAuth(() => setSurface("session"));
  }, [gate]);

  const value = useMemo<QuickAdd>(() => ({ openMenu, openSession }), [openMenu, openSession]);

  // An evening already in progress is almost always what the "+" meant, so it
  // is the first row rather than something to go and find on the list.
  const openSessionRow = sessions.data?.find((item) => item.status === "open") ?? null;
  const admin = me.data?.is_admin ?? false;

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
          {openSessionRow ? (
            <Row
              title="Indtast kampe"
              hint="Aftenen er i gang"
              icon={<PadelIcon />}
              onClick={() => {
                haptic("tap");
                setSurface(null);
                router.push(`/sessions/${openSessionRow.id}/entry`);
              }}
            />
          ) : null}

          <Row
            title="Ny træningssession"
            hint="En aften der er blevet spillet"
            icon={<PlusIcon />}
            onClick={() => {
              haptic("tap");
              setSurface("session");
            }}
          />

          {/* Forward-looking, unlike everything above it: these two put a
              date in the calendar for people to answer, rather than writing
              down something that already happened. */}
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

      {/* Keyed so every opening starts on today's date with an empty note. */}
      {surface === "session" ? (
        <SessionForm key="new-session" open onOpenChange={() => setSurface(null)} />
      ) : null}
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
