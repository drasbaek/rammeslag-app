"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useCreateSeason, useUpdateSeason } from "@/lib/queries";
import { seasonRange, seasonSuggestions, todayISO } from "@/lib/seasons";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { SeasonOut } from "@/lib/types";

const FIELD =
  "w-full rounded-row border border-line bg-ink-900 px-3 py-2.5 text-body text-chalk placeholder:text-dim focus:border-volt/60 focus:outline-none";

/**
 * Add or edit one season. Both dates are inclusive, and the backend refuses
 * an overlap — its message is shown as it comes, because it knows which
 * season is in the way and this form does not.
 */
export function SeasonForm({
  open,
  onOpenChange,
  season,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  season: SeasonOut | null;
}) {
  const create = useCreateSeason();
  const update = useUpdateSeason();

  // Mounted fresh per season by the caller, so the initial state is the whole
  // story — no effect resetting fields behind the user's back.
  const [name, setName] = useState(season?.name ?? "");
  const [startsOn, setStartsOn] = useState(season?.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(season?.ends_on ?? "");
  const [error, setError] = useState<string | null>(null);

  const pending = create.isPending || update.isPending;
  const suggestions = seasonSuggestions(todayISO());

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Skriv et navn — for eksempel “Efterår 2026”.");
      haptic("warn");
      return;
    }
    if (!startsOn || !endsOn) {
      setError("Både start og slut skal sættes.");
      haptic("warn");
      return;
    }
    if (endsOn < startsOn) {
      setError("Slutdatoen ligger før startdatoen.");
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

    if (season) {
      update
        .mutateAsync({
          id: season.id,
          body: { name: trimmed, starts_on: startsOn, ends_on: endsOn },
        })
        .then(done)
        .catch(fail);
    } else {
      create
        .mutateAsync({ name: trimmed, starts_on: startsOn, ends_on: endsOn })
        .then(done)
        .catch(fail);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={season ? "Ret sæson" : "Ny sæson"}
      description={
        season
          ? "Flyttes datoerne, flytter sessionerne indenfor med."
          : "Sessioner kan kun ligge inden i en sæson. Begge datoer tæller med."
      }
    >
      <div className="space-y-3">
        {season ? null : (
          <div>
            <span className="eyebrow block pb-1.5">Forslag</span>
            <div className="grid grid-cols-2 gap-2">
              {suggestions.map((option) => {
                const chosen = name === option.name && startsOn === option.starts_on;
                return (
                  <button
                    key={option.name}
                    onClick={() => {
                      haptic("tap");
                      setName(option.name);
                      setStartsOn(option.starts_on);
                      setEndsOn(option.ends_on);
                      setError(null);
                    }}
                    className={cn(
                      "rounded-row border px-3 py-2 text-left transition-colors",
                      chosen ? "border-volt/50 bg-volt/10" : "border-line bg-ink-900",
                    )}
                  >
                    <span className="block text-[13px] font-bold">{option.name}</span>
                    <span className="num block text-[10px] text-dim">{seasonRange(option)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <label className="block">
          <span className="eyebrow block pb-1.5">Navn</span>
          <input
            className={FIELD}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Efterår 2026"
            autoComplete="off"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="eyebrow block pb-1.5">Starter</span>
            <input
              type="date"
              className={cn(FIELD, "num")}
              value={startsOn}
              onChange={(event) => setStartsOn(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="eyebrow block pb-1.5">Slutter</span>
            <input
              type="date"
              className={cn(FIELD, "num")}
              value={endsOn}
              onChange={(event) => setEndsOn(event.target.value)}
            />
          </label>
        </div>

        {error ? <p className="text-mini text-loss">{error}</p> : null}

        <Button variant="volt" size="lg" className="w-full" disabled={pending} onClick={submit}>
          {pending ? "Gemmer…" : season ? "Gem ændringer" : "Opret sæson"}
        </Button>
      </div>
    </Sheet>
  );
}
