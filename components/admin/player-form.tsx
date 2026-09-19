"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useCreatePlayer, useUpdatePlayer } from "@/lib/queries";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { PlayerOut, PlayerUpdate } from "@/lib/types";

const FIELD =
  "w-full rounded-row border border-line bg-ink-900 px-3 py-2.5 text-body text-chalk placeholder:text-dim focus:border-volt/60 focus:outline-none";

/** Mirrors `PlayerCreate.pin` / `PlayerUpdate.pin`: 4 to 64 characters. */
const PIN_MIN = 4;
const PIN_MAX = 64;

/** A pair of chips. `value` of null means nothing is chosen yet. */
function Choice<T extends string | boolean>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T | null;
  options: { value: T; label: string; hint: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div>
      <span className="eyebrow block pb-1.5">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={String(option.value)}
            onClick={() => {
              haptic("tap");
              onChange(option.value);
            }}
            className={cn(
              "rounded-row border px-3 py-2 text-left transition-colors",
              value === option.value ? "border-volt/50 bg-volt/10" : "border-line bg-ink-900",
            )}
          >
            <span className="block truncate text-[13px] font-bold">{option.label}</span>
            <span className="block truncate text-[10px] text-dim">{option.hint}</span>
          </button>
        ))}
      </div>
      {hint ? <span className="mt-1 block text-[10px] leading-snug text-dim">{hint}</span> : null}
    </div>
  );
}

/**
 * Add or edit one player. The entry rating has no default and no placeholder
 * value that could be mistaken for one: docs/RATING.md says an admin decides
 * it, so the form refuses to guess.
 *
 * The PIN is the only way anybody logs in, and it is write-only in both
 * directions: the API hashes it and never hands it back, so an empty field
 * means "leave it as it was" rather than "clear it". Same for the admin flag —
 * `GET /api/players` does not carry it, so on an existing player neither chip
 * starts pressed and nothing is sent until one is.
 */
export function PlayerForm({
  open,
  onOpenChange,
  player,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: PlayerOut | null;
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
  // null on an existing player: the roster endpoint does not say who is an
  // admin, so the form does not pretend to know and sends nothing until asked.
  const [isAdmin, setIsAdmin] = useState<boolean | null>(player ? null : false);
  const [pin, setPin] = useState("");
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

    const secret = pin.trim();
    if (secret !== "" && (secret.length < PIN_MIN || secret.length > PIN_MAX)) {
      setError(`PIN skal være mellem ${PIN_MIN} og ${PIN_MAX} tegn.`);
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
      const body: PlayerUpdate = { name: trimmed, entry_rating: value, is_guest: isGuest };
      if (isAdmin !== null) body.is_admin = isAdmin;
      if (secret !== "") body.pin = secret;
      update.mutateAsync({ id: player.id, body }).then(done).catch(fail);
    } else {
      create
        .mutateAsync({
          name: trimmed,
          entry_rating: value,
          is_guest: isGuest,
          is_admin: isAdmin ?? false,
          ...(secret !== "" ? { pin: secret } : {}),
        })
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

        <Choice
          label="Status"
          value={isGuest}
          onChange={setIsGuest}
          options={[
            { value: false, label: "Medlem", hint: "Står på stigen" },
            { value: true, label: "Gæst", hint: "Skjult som standard" },
          ]}
        />

        <label className="block">
          <span className="eyebrow block pb-1.5">PIN</span>
          <input
            className={cn(FIELD, "num tracking-[0.3em]")}
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={PIN_MAX}
            placeholder={player ? "Sæt en ny PIN" : "Mindst fire tegn"}
          />
          <span className="mt-1 block text-[10px] leading-snug text-dim">
            {player
              ? "Tomt felt ændrer ikke PIN'en. En ny PIN erstatter den gamle med det samme."
              : "Uden PIN kan spilleren ikke logge ind. Den kan sættes senere."}
          </span>
        </label>

        <Choice
          label="Rettigheder"
          value={isAdmin}
          onChange={setIsAdmin}
          options={[
            { value: false, label: "Spiller", hint: "Kan skrive kampe" },
            { value: true, label: "Admin", hint: "Kan rette alt" },
          ]}
          hint={
            player
              ? "Spillerlisten oplyser ikke hvem der er admin. Vælg kun, hvis du vil ændre det."
              : undefined
          }
        />

        {error ? <p className="text-mini text-loss">{error}</p> : null}

        <Button variant="volt" size="lg" className="w-full" disabled={pending} onClick={submit}>
          {pending ? "Gemmer…" : player ? "Gem ændringer" : "Tilføj spiller"}
        </Button>
      </div>
    </Sheet>
  );
}
