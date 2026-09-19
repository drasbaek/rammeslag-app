"use client";

import { useCallback, useEffect, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { usePlayers, useLogin } from "@/lib/queries";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { PlayerOut } from "@/lib/types";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

/**
 * Reads are public, so this only ever appears in front of a write. Two steps:
 * pick your name, tap four digits.
 */
export function LoginSheet({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const players = usePlayers();
  const login = useLogin();
  const [selected, setSelected] = useState<PlayerOut | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Closing resets the sheet. Doing it here rather than in an effect keeps it
  // to one render: every close path goes through this handler.
  const close = useCallback(
    (next: boolean) => {
      if (!next) {
        setSelected(null);
        setPin("");
        setError(null);
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  useEffect(() => {
    if (!selected || pin.length !== 4 || login.isPending) return;
    login
      .mutateAsync({ playerId: selected.id, pin })
      .then(() => {
        haptic("success");
        close(false);
        onSuccess?.();
      })
      .catch(() => {
        haptic("warn");
        setError("Forkert PIN. Prøv igen.");
        setPin("");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, selected]);

  const roster = (players.data ?? []).filter((p) => !p.is_guest);

  return (
    <Sheet
      open={open}
      onOpenChange={close}
      title={selected ? "Indtast PIN" : "Hvem er du?"}
      description={
        selected
          ? `${selected.name} · fire cifre`
          : "Alle kan kigge med. Kun holdet kan skrive."
      }
    >
      {!selected ? (
        <div className="max-h-[46vh] space-y-1 overflow-y-auto pb-2">
          {roster.map((player) => (
            <button
              key={player.id}
              onClick={() => {
                haptic("tap");
                setSelected(player);
              }}
              className="flex w-full items-center gap-3 rounded-row border border-transparent bg-ink-800 px-3 py-3 text-left transition-colors active:border-volt/40"
            >
              <Avatar name={player.name} size="sm" />
              <span className="min-w-0 flex-1 truncate text-body font-semibold">{player.name}</span>
              <svg viewBox="0 0 8 12" className="h-3 w-2 text-dim" aria-hidden>
                <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
              </svg>
            </button>
          ))}
          {roster.length === 0 ? <p className="py-6 text-center text-mini text-dim">Henter spillere…</p> : null}
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-center gap-3 py-4">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  "h-3.5 w-3.5 rounded-full border transition-all duration-200",
                  i < pin.length ? "scale-110 border-volt bg-volt" : "border-ink-500 bg-transparent",
                  error ? "border-loss" : "",
                )}
              />
            ))}
          </div>
          <p className={cn("h-5 text-center text-mini", error ? "text-loss" : "text-dim")}>
            {error ?? (login.isPending ? "Logger ind…" : " ")}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {KEYS.map((key, i) =>
              key === "" ? (
                <span key={i} />
              ) : (
                <button
                  key={i}
                  onClick={() => {
                    haptic("tap");
                    setError(null);
                    if (key === "⌫") setPin((value) => value.slice(0, -1));
                    else setPin((value) => (value.length < 4 ? value + key : value));
                  }}
                  className="num h-14 rounded-row border border-line bg-ink-800 text-xl font-bold transition-transform active:scale-95 active:bg-ink-700"
                >
                  {key}
                </button>
              ),
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mx-auto mt-3 block"
            onClick={() => {
              setSelected(null);
              setPin("");
              setError(null);
            }}
          >
            Skift spiller
          </Button>
        </div>
      )}
    </Sheet>
  );
}
