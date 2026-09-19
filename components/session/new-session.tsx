"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { SessionForm } from "@/components/session/session-form";
import { useAuthGate } from "@/components/auth/auth-gate";

interface NewSession {
  /** Opens the create-session sheet, logging in first if nobody is. */
  open: () => void;
}

const Context = createContext<NewSession | null>(null);

/**
 * One create-session sheet for the whole app.
 *
 * It lives above the screens because two places open it — the button on the
 * session list and the round "+" in the tab bar — and a sheet that two screens
 * each own a copy of is a sheet that opens twice.
 */
export function NewSessionProvider({ children }: { children: ReactNode }) {
  const gate = useAuthGate();
  const [open, setOpen] = useState(false);

  const start = useCallback(() => {
    gate.requireAuth(() => setOpen(true));
  }, [gate]);

  const value = useMemo<NewSession>(() => ({ open: start }), [start]);

  return (
    <Context.Provider value={value}>
      {children}
      {/* Keyed so every opening starts on today's date with an empty note. */}
      {open ? <SessionForm key="new-session" open onOpenChange={setOpen} /> : null}
    </Context.Provider>
  );
}

export function useNewSession(): NewSession {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useNewSession uden NewSessionProvider");
  return ctx;
}
