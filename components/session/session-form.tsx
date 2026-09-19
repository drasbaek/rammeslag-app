"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useCreateSession, useSeasons } from "@/lib/queries";
import { seasonFor, seasonRange, todayISO } from "@/lib/seasons";
import { SESSION_TYPE_LABEL } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { SessionType } from "@/lib/types";

const FIELD =
  "w-full rounded-row border border-line bg-ink-900 px-3 py-2.5 text-body text-chalk placeholder:text-dim focus:border-volt/60 focus:outline-none";

const TYPES: { value: SessionType; hint: string }[] = [
  { value: "training", hint: "Den normale aften" },
  { value: "casual", hint: "Uden fast program" },
  { value: "social", hint: "Bødekasse og fadøl" },
  { value: "tournament", hint: "Med pokal" },
];

/**
 * Start an evening.
 *
 * The date is free on purpose: most of what goes in here is a backfill of
 * evenings already played, and locking it to today would make the app useless
 * for exactly the job it is being opened for. The season is never chosen — the
 * backend resolves it from the date — so the form shows which season the date
 * lands in while it is being picked, and says so out loud when it lands in
 * none. That is the one failure this form exists to make survivable.
 */
export function SessionForm({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const create = useCreateSession();
  const seasons = useSeasons();

  const [playedOn, setPlayedOn] = useState(todayISO());
  const [type, setType] = useState<SessionType>("training");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const season = playedOn ? seasonFor(seasons.data ?? [], playedOn) : null;
  // Only trustworthy once the seasons are actually here; until then the form
  // says nothing rather than accusing a perfectly good date.
  const uncovered = Boolean(playedOn) && !seasons.isPending && !season;

  const submit = () => {
    if (!playedOn) {
      setError("Vælg en dato.");
      haptic("warn");
      return;
    }
    create
      .mutateAsync({
        played_on: playedOn,
        type,
        note: note.trim() ? note.trim() : null,
      })
      .then((session) => {
        haptic("success");
        onOpenChange(false);
        // Creating an evening and writing the first score is one motion.
        router.push(`/sessions/${session.id}/entry`);
      })
      .catch((cause: Error) => {
        haptic("warn");
        setError(cause.message);
      });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Ny session"
      description="Vælg datoen aftenen blev spillet. Sæsonen følger af datoen."
    >
      <div className="space-y-3">
        <label className="block">
          <span className="eyebrow block pb-1.5">Dato</span>
          <input
            type="date"
            className={cn(FIELD, "num")}
            value={playedOn}
            onChange={(event) => {
              setPlayedOn(event.target.value);
              setError(null);
            }}
          />
          {seasons.isPending || !playedOn ? null : season ? (
            <span className="mt-1 block text-[10px] leading-snug text-dim">
              Lander i <span className="font-semibold text-mute">{season.name}</span> ·{" "}
              <span className="num">{seasonRange(season)}</span>
            </span>
          ) : null}
        </label>

        {uncovered ? (
          <div className="rounded-card border border-volt/30 bg-volt/[0.06] px-3 py-3">
            <p className="text-[13px] font-bold text-chalk">
              Ingen sæson dækker den dato.
            </p>
            <p className="mt-1 text-mini text-mute">
              En session skal ligge inden i en sæson. Opret sæsonen først, så kan aftenen gemmes.
            </p>
            <Link
              href="/admin/seasons"
              onClick={() => onOpenChange(false)}
              className="mt-2 inline-block text-mini font-semibold text-volt"
            >
              Gå til sæsoner →
            </Link>
          </div>
        ) : null}

        <div>
          <span className="eyebrow block pb-1.5">Type</span>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  haptic("tap");
                  setType(option.value);
                }}
                className={cn(
                  "rounded-row border px-3 py-2 text-left transition-colors",
                  type === option.value ? "border-volt/50 bg-volt/10" : "border-line bg-ink-900",
                )}
              >
                <span className="block truncate text-[13px] font-bold">
                  {SESSION_TYPE_LABEL[option.value]}
                </span>
                <span className="block truncate text-[10px] text-dim">{option.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="eyebrow block pb-1.5">Note (valgfri)</span>
          <input
            className={FIELD}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Bane 3 og 4. Kold hal."
            autoComplete="off"
          />
        </label>

        {error ? (
          <div className="rounded-row border border-loss/30 bg-loss/10 px-3 py-2">
            <p className="text-mini text-loss">{error}</p>
            {/* The backend's own sentence is "Der findes ingen sæson, der
                dækker den dato." — the one failure with somewhere to go. */}
            {error.toLowerCase().includes("sæson") ? (
              <Link
                href="/admin/seasons"
                onClick={() => onOpenChange(false)}
                className="mt-1 inline-block text-mini font-semibold text-volt"
              >
                Gå til sæsoner →
              </Link>
            ) : null}
          </div>
        ) : null}

        <Button
          variant="volt"
          size="lg"
          className="w-full"
          disabled={create.isPending}
          onClick={submit}
        >
          {create.isPending ? "Opretter…" : "Opret og indtast kampe"}
        </Button>
      </div>
    </Sheet>
  );
}
