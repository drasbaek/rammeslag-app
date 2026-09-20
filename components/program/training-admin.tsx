"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { useDeleteEvent, useUpdateEvent } from "@/lib/queries";
import { courtsFor } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { COURT_CAPACITY, type EventDetailOut } from "@/lib/types";

/** What the hall actually rents out on a Sunday morning. */
const COURT_OPTIONS = [1, 2, 3, 4];

/**
 * The three things that happen to a Sunday after it is created: the booking
 * shrinks, it gets called off, or it never should have existed.
 *
 * Baner is the one that moves most — three is normal, two is what is left when
 * the hall is busy — so it is a control rather than a trip through the edit
 * form. Capacity is baner × four everywhere, which is why this writes the
 * places and the rest of the screen divides them back.
 *
 * Aflys is not delete: the answers stay, because "hvem havde meldt sig" is the
 * first thing asked when a cancelled Sunday gets rearranged. Delete is the
 * only thing here with no way back, so it asks twice and lives under a line.
 */
export function TrainingAdmin({ event }: { event: EventDetailOut }) {
  const router = useRouter();
  const update = useUpdateEvent(event.id);
  const remove = useDeleteEvent(event.id);
  const [error, setError] = useState<string | null>(null);
  /** The delete button asks twice. Nothing here is undoable. */
  const [confirming, setConfirming] = useState(false);

  const cancelled = event.status === "cancelled";
  const courts = courtsFor(event.capacity);
  const pending = update.isPending || remove.isPending;

  const fail = (cause: Error) => {
    haptic("warn");
    setError(cause.message);
  };

  const setCourts = (next: number) => {
    if (next === courts) return;
    setError(null);
    update.mutateAsync({ capacity: next * COURT_CAPACITY }).then(() => haptic("success")).catch(fail);
  };

  const toggleCancelled = () => {
    haptic("tap");
    setError(null);
    update
      .mutateAsync({ status: cancelled ? "open" : "cancelled" })
      .then(() => haptic("success"))
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
        router.push("/program");
      })
      .catch(fail);
  };

  return (
    <div className="rounded-card border border-line bg-ink-850/40 px-4 py-3">
      <span className="eyebrow block pb-2">Træningen</span>

      <span className="block pb-1.5 text-[10px] font-semibold text-dim">
        Baner · {event.capacity} pladser
      </span>
      <Segmented
        options={COURT_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
        value={String(courts)}
        onChange={(value) => setCourts(Number(value))}
      />

      <Button
        variant={cancelled ? "solid" : "ghost"}
        className="mt-3 w-full"
        disabled={pending}
        onClick={toggleCancelled}
      >
        {cancelled ? "Genåbn træningen" : "Aflys træningen"}
      </Button>
      <p className="mt-1.5 text-center text-[10px] leading-snug text-dim">
        {cancelled
          ? "Svarene står der stadig, så en ny dato starter ikke forfra."
          : "Svarene bliver stående. Ingen kan svare, mens den er aflyst."}
      </p>

      {error ? (
        <div className="mt-2 rounded-row border border-loss/30 bg-loss/10 px-3 py-2">
          <p className="text-mini text-loss">{error}</p>
        </div>
      ) : null}

      <div className="mt-3 border-t border-line-soft pt-3">
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
              : "Slet træningen"}
        </Button>
        <p className="mt-1.5 text-center text-[10px] leading-snug text-dim">
          {confirming
            ? "Svarene og planen forsvinder med den. Kan ikke fortrydes."
            : "Sletter datoen og alle svar. Aftenens kampe bliver, hvor de er."}
        </p>
      </div>
    </div>
  );
}
