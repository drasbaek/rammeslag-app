"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useDeleteEvent, useUpdateEvent } from "@/lib/queries";
import { haptic } from "@/lib/haptics";
import type { EventDetailOut, EventStatus } from "@/lib/types";

const CAPTION: Record<EventStatus, string> = {
  open: "Alle kan stadig skifte svar. Lås, når holdet står.",
  locked: "Låst. Svarene står fast, indtil du genåbner.",
  cancelled: "Aflyst. Svarene og holdet bliver stående.",
};

/**
 * The three things only an admin does to a fixture: låse, aflyse, slette.
 *
 * Låsning is the one with teeth. It does not pick anybody and it does not
 * change an answer — it stops the answers moving, so the team sheet an admin
 * has just written stays the one people turn up to. Aflysning is reversible on
 * purpose: a cancelled fixture keeps every answer, because the hall falls
 * through more often than the team does.
 */
export function MatchAdminBar({ event }: { event: EventDetailOut }) {
  const router = useRouter();
  const update = useUpdateEvent(event.id);
  const remove = useDeleteEvent(event.id);
  const [error, setError] = useState<string | null>(null);
  /** The delete button asks twice. Nothing here is undoable. */
  const [confirming, setConfirming] = useState(false);

  const pending = update.isPending || remove.isPending;

  const fail = (cause: Error) => {
    haptic("warn");
    setError(cause.message);
  };

  const setStatus = (status: EventStatus) => {
    setError(null);
    update
      .mutateAsync({ status })
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
    <div className="border-t border-line-soft pt-4">
      <span className="eyebrow block pb-2">Admin</span>

      <div className="grid grid-cols-2 gap-2">
        {event.status === "open" ? (
          <Button variant="solid" disabled={pending} onClick={() => setStatus("locked")}>
            Lås holdet
          </Button>
        ) : (
          <Button variant="solid" disabled={pending} onClick={() => setStatus("open")}>
            Genåbn
          </Button>
        )}
        {event.status === "cancelled" ? null : (
          <Button variant="ghost" disabled={pending} onClick={() => setStatus("cancelled")}>
            Aflys kampen
          </Button>
        )}
      </div>

      <p className="mt-1.5 text-[10px] leading-snug text-dim">{CAPTION[event.status]}</p>

      {error ? (
        <div className="mt-2 rounded-row border border-loss/30 bg-loss/10 px-3 py-2">
          <p className="text-mini text-loss">{error}</p>
        </div>
      ) : null}

      {/* Deleting takes the answers and the holdet with it, and there is no
          undo — so it sits under a line of its own and asks twice, exactly
          like deleting an evening does. */}
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
              : "Slet kampen"}
        </Button>
        <p className="mt-1.5 text-center text-[10px] leading-snug text-dim">
          {confirming
            ? "Svarene og holdet forsvinder med kampen."
            : "Sletter kampen og alle svar. Kan ikke fortrydes."}
        </p>
      </div>
    </div>
  );
}
