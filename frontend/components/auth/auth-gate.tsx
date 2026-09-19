"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { LoginSheet } from "@/components/auth/login-sheet";
import { useMe } from "@/lib/queries";

interface AuthGate {
  /** Runs `action` now if logged in, otherwise after a successful login. */
  requireAuth: (action?: () => void) => void;
  openLogin: () => void;
}

const Context = createContext<AuthGate | null>(null);

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  const requireAuth = useCallback(
    (action?: () => void) => {
      if (me.data?.player) {
        action?.();
        return;
      }
      pending.current = action ?? null;
      setOpen(true);
    },
    [me.data?.player],
  );

  const value = useMemo<AuthGate>(
    () => ({ requireAuth, openLogin: () => setOpen(true) }),
    [requireAuth],
  );

  return (
    <Context.Provider value={value}>
      {children}
      <LoginSheet
        open={open}
        onOpenChange={setOpen}
        onSuccess={() => {
          const action = pending.current;
          pending.current = null;
          action?.();
        }}
      />
    </Context.Provider>
  );
}

export function useAuthGate(): AuthGate {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useAuthGate uden AuthGateProvider");
  return ctx;
}
