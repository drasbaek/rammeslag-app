"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useCreatePlayer, useUpdatePlayer } from "@/lib/queries";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { Player } from "@/lib/types";

const FIELD =
  "w-full rounded-row border border-line bg-ink-900 px-3 py-2.5 text-body text-chalk placeholder:text-dim focus:border-volt/60 focus:outline-none";

/**
 * Add or edit one player. The entry rating has no default and no placeholder
 * value that could be mistaken for one: docs/RATING.md says an admin decides
 * it, so the form refuses to guess.
 */
export function PlayerForm({
  open,
  onOpenChange,
  player,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: Player | null;
}) {
  const create = useCreatePlayer();
  const update = useUpdatePlayer();

  // The caller mounts this fresh per player, so the initial state is the
  // whole story — no effect resetting fields behind the user's back.
  const [name, setName] = useState(player?.name ?? "");
  const [entryRating, setEntryRating] = useState(
    player ? String(Math.round(player.entry_rating)) : "",
  );
  const [isGuest, setIsGuest] = useState(player?.is_guest ?? false);
  const [error, setError] = useState<string | null>(null);

  const pending = create.isPending || update.isPending;

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Skriv et navn.");
      haptic("warn");
      return;
    }
    const value = Number(entryRating);
    if (entryRating.trim() === "" || !Number.isFinite(value) || value < 400 || value > 2000) {
      setError("Indgangsrating skal sættes — et tal mellem 400 og 2000.");
      haptic("warn");
      return;
    }

    const done = () => {
      haptic("success");
      onOpenChange(false);
    };
    const fail = (cause: Error) => {
      haptic("warn");
      setError(cause.message);
    };

    if (player) {
      update
        .mutateAsync({ id: player.id, body: { name: trimmed, entry_rating: value, is_guest: isGuest } })
        .then(done)
        .catch(fail);
    } else {
      create
        .mutateAsync({ name: trimmed, entry_rating: value, is_guest: isGuest })
        .then(done)
        .catch(fail);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={player ? "Ret spiller" : "Tilføj spiller"}
      description={
        player
          ? "Rettes indgangsratingen, spilles hele historikken om."
          : "Indgangsratingen er obligatorisk. Der er ingen standardværdi."
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="eyebrow block pb-1.5">Navn</span>
          <input
            className={FIELD}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Fornavn Efternavn"
            autoComplete="off"
          />
        </label>

        <label className="block">
          <span className="eyebrow block pb-1.5">Indgangsrating</span>
          <input
            className={cn(FIELD, "num")}
            value={entryRating}
            onChange={(event) => setEntryRating(event.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            placeholder="Sæt et tal"
            autoComplete="off"
          />
          <span className="mt-1 block text-[10px] leading-snug text-dim">
            1000 er forslaget, ikke reglen. En rutineret ny spiller starter højere.
          </span>
        </label>

        <div>
          <span className="eyebrow block pb-1.5">Status</span>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: false, label: "Medlem", hint: "Står på stigen" },
              { value: true, label: "Gæst", hint: "Skjult som standard" },
            ].map((option) => (
              <button
                key={String(option.value)}
                onClick={() => {
                  haptic("tap");
                  setIsGuest(option.value);
                }}
                className={cn(
                  "rounded-row border px-3 py-2 text-left transition-colors",
                  isGuest === option.value
                    ? "border-volt/50 bg-volt/10"
                    : "border-line bg-ink-900",
                )}
              >
                <span className="block text-[13px] font-bold">{option.label}</span>
                <span className="block text-[10px] text-dim">{option.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="text-mini text-loss">{error}</p> : null}

        <Button variant="volt" size="lg" className="w-full" disabled={pending} onClick={submit}>
          {pending ? "Gemmer…" : player ? "Gem ændringer" : "Tilføj spiller"}
        </Button>
      </div>
    </Sheet>
  );
}
