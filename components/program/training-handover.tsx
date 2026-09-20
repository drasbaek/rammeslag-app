"use client";

import Link from "next/link";
import type { EventDetailOut } from "@/lib/types";

/**
 * The way from a Sunday people answered to the evening its scores go into.
 *
 * It used to be a button, and the button was the second half of a decision an
 * admin had already made: setting the kampe and opening the evening they are
 * played on are one thing, so setting the kampe now does both. What is left
 * here is a door — the evening exists, and this is how the rest of the team
 * finds it.
 *
 * The event and the session stay two different things. One is a date people
 * answered; the other is what happened. Nothing on this screen has a score on
 * it, and no kamp exists until somebody types one in.
 */
export function TrainingHandover({ event }: { event: EventDetailOut }) {
  if (!event.session_id) return null;

  const planned = event.matchups.length;

  return (
    <Link
      href={`/sessions/${event.session_id}`}
      className="flex items-center justify-between gap-3 rounded-card border border-volt/35 bg-volt/[0.06] px-4 py-3 transition-colors active:bg-volt/10"
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-bold tracking-tight text-chalk">
          Aftenen er klar
        </span>
        <span className="mt-0.5 block text-[10px] text-dim">
          {planned === 1
            ? "Én kamp venter på et resultat."
            : `${planned} kampe venter på resultater.`}
        </span>
      </span>
      <span className="shrink-0 text-[11px] font-bold text-volt">Indtast resultater →</span>
    </Link>
  );
}
