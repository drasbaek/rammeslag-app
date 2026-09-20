"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCreateSessionForEvent } from "@/lib/queries";
import { writeAttendance } from "@/lib/attendance";
import { haptic } from "@/lib/haptics";
import type { EventDetailOut } from "@/lib/types";

/**
 * From a Sunday people answered to an evening with scores in it.
 *
 * The event and the session stay two different things — one is a date people
 * answered, the other is what happened — so this does not convert anything. It
 * opens an empty session, links the two, and carries the yes-list across as
 * the entry screen's squad, which is the only part of the plan that survives:
 * still nobody has played, and no kamp exists until one is typed in.
 *
 * `lib/attendance.ts` is localStorage on one phone, so this pre-fills the
 * picker on the phone that pressed the button and on no other. That is the
 * same deal the entry screen has always had — anyone else taps "Ret fremmødte"
 * once — and it is why the yes-list is copied rather than stored server-side.
 */
export function TrainingHandover({
  event,
  isAdmin,
}: {
  event: EventDetailOut;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const create = useCreateSessionForEvent(event.id);
  const [error, setError] = useState<string | null>(null);

  // Once the evening exists it belongs to everybody, not just the admin who
  // opened it: the link is how the rest of the team finds the scores.
  if (event.session_id) {
    return (
      <Link
        href={`/sessions/${event.session_id}`}
        className="flex items-center justify-between gap-3 rounded-card border border-volt/35 bg-volt/[0.06] px-4 py-3 transition-colors active:bg-volt/10"
      >
        <span className="min-w-0">
          <span className="block text-[13px] font-bold tracking-tight text-chalk">
            Aftenen er oprettet
          </span>
          <span className="mt-0.5 block text-[10px] text-dim">
            Kampene skrives ind på sessionen.
          </span>
        </span>
        <span className="shrink-0 text-[11px] font-bold text-volt">Gå til aftenen →</span>
      </Link>
    );
  }

  if (!isAdmin || event.status === "cancelled") return null;

  const attending = event.responses.filter((r) => r.state === "yes").map((r) => r.player.id);

  const open = () => {
    setError(null);
    create
      .mutateAsync()
      .then((session) => {
        haptic("success");
        // An empty list is not "nobody came" — it is an answer the entry
        // screen would believe. With no tilmeldte it asks, the way it always
        // has on a phone that has not seen the evening before.
        if (attending.length > 0) writeAttendance(session.id, attending);
        router.push(`/sessions/${session.id}/entry`);
      })
      .catch((cause: Error) => {
        haptic("warn");
        setError(cause.message);
      });
  };

  return (
    <div>
      <Button
        variant="volt"
        size="lg"
        className="w-full"
        disabled={create.isPending}
        onClick={open}
      >
        {create.isPending ? "Opretter…" : "Opret aftenen og indtast kampe"}
      </Button>
      <p className="mt-1.5 text-center text-[10px] leading-snug text-dim">
        {attending.length > 0
          ? `De ${attending.length} tilmeldte står klar i spillervælgeren.`
          : "Ingen har meldt sig endnu — så starter aftenen med hele holdet."}
      </p>
      {error ? (
        <div className="mt-2 rounded-row border border-loss/30 bg-loss/10 px-3 py-2">
          <p className="text-mini text-loss">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
