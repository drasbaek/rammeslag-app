"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  useCreateSession,
  useDeleteSession,
  useMe,
  useSeasons,
  useUpdateSession,
} from "@/lib/queries";
import { seasonFor, seasonRange, todayISO } from "@/lib/seasons";
import { sessionTypeLabel } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { SessionType } from "@/lib/types";

const FIELD =
  "w-full rounded-row border border-line bg-ink-900 px-3 py-2.5 text-body text-chalk placeholder:text-dim focus:border-volt/60 focus:outline-none";

/**
 * Only the two kinds of evening the team actually books a court for.
 *
 * The backend enum is wider — "social" and "tournament" still exist and still
 * render everywhere a session is shown, because old rows carry them and
 * "social" is reserved for a bødekasse night with no padel played. Narrowing
 * lives here, in the picker, and nowhere else.
 */
const TYPES: { value: SessionType; hint: string }[] = [
  { value: "training", hint: "Den normale aften" },
  { value: "casual", hint: "Uden fast program" },
];

/** What the form needs to know about an evening it is editing. */
export interface EditableSession {
  id: string;
  played_on: string;
  type: SessionType;
  note: string | null;
}

/**
 * Start an evening, or correct one that was written down wrong.
 *
 * The date is free on purpose: most of what goes in here is a backfill of
 * evenings already played, and locking it to today would make the app useless
 * for exactly the job it is being opened for. The season is never chosen — the
 * backend resolves it from the date — so the form shows which season the date
 * lands in while it is being picked, and says so out loud when it lands in
 * none. That is the one failure this form exists to make survivable.
 *
 * Editing is the same form with the same rules. Moving the date moves the
 * evening's matches with it and every rating is replayed from the matches, so
 * a correction here re-computes the ladder without anything being recalculated
 * by hand. Deleting does the same thing with nothing left behind, which is why
 * it is admin-only and asks twice.
 */
export function SessionForm({
  open,
  onOpenChange,
  session = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The evening being corrected, or null to start a new one. */
  session?: EditableSession | null;
}) {
  const router = useRouter();
  const me = useMe();
  const create = useCreateSession();
  const update = useUpdateSession(session?.id ?? "");
  const remove = useDeleteSession(session?.id ?? "");
  const seasons = useSeasons();

  const [playedOn, setPlayedOn] = useState(session?.played_on ?? todayISO());
  const [type, setType] = useState<SessionType>(session?.type ?? "training");
  const [note, setNote] = useState(session?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  /** The delete button asks twice. Nothing here is undoable. */
  const [confirming, setConfirming] = useState(false);

  const season = playedOn ? seasonFor(seasons.data ?? [], playedOn) : null;
  // Only trustworthy once the seasons are actually here; until then the form
  // says nothing rather than accusing a perfectly good date.
  const uncovered = Boolean(playedOn) && !seasons.isPending && !season;
  const pending = create.isPending || update.isPending || remove.isPending;

  const fail = (cause: Error) => {
    haptic("warn");
    setError(cause.message);
  };

  const submit = () => {
    if (!playedOn) {
      setError("Vælg en dato.");
      haptic("warn");
      return;
    }
    const trimmed = note.trim();

    if (session) {
      update
        .mutateAsync({ played_on: playedOn, type, note: trimmed })
        .then(() => {
          haptic("success");
          onOpenChange(false);
        })
        .catch(fail);
      return;
    }

    create
      .mutateAsync({ played_on: playedOn, type, note: trimmed ? trimmed : null })
      .then((created) => {
        haptic("success");
        onOpenChange(false);
        // Creating an evening and writing the first score is one motion.
        router.push(`/sessions/${created.id}/entry`);
      })
      .catch(fail);
  };

  const destroy = () => {
    if (!confirming) {
      haptic("warn");
      setConfirming(true);
      return;
    }
    remove
      .mutateAsync()
      .then(() => {
        haptic("success");
        onOpenChange(false);
        router.push("/sessions");
      })
      .catch(fail);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={session ? "Ret træningssession" : "Ny træningssession"}
      description={
        session
          ? "Flyttes datoen, flytter aftenens kampe med — og ratingen spilles om."
          : "Vælg datoen aftenen blev spillet. Sæsonen følger af datoen."
      }
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
                  {sessionTypeLabel(option.value)}
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
          disabled={pending}
          onClick={submit}
        >
          {session
            ? update.isPending
              ? "Gemmer…"
              : "Gem ændringer"
            : create.isPending
              ? "Opretter…"
              : "Opret og indtast kampe"}
        </Button>

        {/* Deleting an evening deletes its kampe and replays the ladder without
            them. There is no undo, so it lives under a line of its own, asks
            twice, and is only offered to an admin — which is who the API lets
            do it anyway. */}
        {session && me.data?.is_admin ? (
          <div className="border-t border-line-soft pt-3">
            <Button
              variant={confirming ? "danger" : "ghost"}
              className="w-full"
              disabled={pending}
              onClick={destroy}
            >
              {remove.isPending
                ? "Sletter…"
                : confirming
                  ? "Tryk igen for at slette for altid"
                  : "Slet træningssessionen"}
            </Button>
            <p className="mt-1.5 text-center text-[10px] leading-snug text-dim">
              {confirming
                ? "Kampene forsvinder med aftenen, og ratingen spilles om uden dem."
                : "Sletter aftenen og alle dens kampe. Kan ikke fortrydes."}
            </p>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
