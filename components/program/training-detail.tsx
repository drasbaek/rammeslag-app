"use client";

import { useState } from "react";
import { useAuthGate } from "@/components/auth/auth-gate";
import { AvailabilityList } from "@/components/program/availability-list";
import { TrainingAdmin } from "@/components/program/training-admin";
import { TrainingGuestSheet } from "@/components/program/training-guest-sheet";
import { TrainingHandover } from "@/components/program/training-handover";
import { TrainingPlan } from "@/components/program/training-plan";
import { TrainingPlanner } from "@/components/program/training-planner";
import { Button } from "@/components/ui/button";
import { useClearResponse, useMe } from "@/lib/queries";
import { courtCount } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { EventDetailOut, PlayerOut, ResponseState } from "@/lib/types";

/**
 * A Sunday: how full it is, and who is coming.
 *
 * The number that matters is places filled against places booked, because
 * that is the number the group chat is really asking about — are we enough,
 * or do we need to find a guest. The second number is how many of the yeses
 * are guests, because that is the one that says whether anybody still has to
 * go looking: eight members and four guests is a full Sunday that took work.
 *
 * Everything below the meter answers "and now what": bring somebody, set the
 * kampe, open the evening. Nothing on this screen writes a kamp — the plan is
 * a whiteboard and the scores are typed on the entry screen.
 */
export function TrainingDetail({ event }: { event: EventDetailOut }) {
  const gate = useAuthGate();
  const me = useMe();
  const clear = useClearResponse(event.id);
  const [addingGuest, setAddingGuest] = useState(false);
  const [planning, setPlanning] = useState(false);

  const isAdmin = Boolean(me.data?.is_admin);
  const cancelled = event.status === "cancelled";
  // Locked means the answers are closed to everybody but an admin, which the
  // API enforces. Offering to add a guest there would be offering a 400.
  const frozen = cancelled || (event.status === "locked" && !isAdmin);

  const filled = event.counts.yes;
  const missing = Math.max(0, event.capacity - filled);
  const short = filled < event.capacity;
  const guests = event.responses.filter((r) => r.state === "yes" && r.player.is_guest).length;
  const members = filled - guests;
  // Never past 100%: a Sunday that is oversubscribed is full, plus a queue.
  const pct = Math.min(100, Math.round((filled / Math.max(1, event.capacity)) * 100));

  /**
   * A guest is taken off the same way they were put on: by clearing the answer
   * somebody wrote for them. Only guests get the button — a member unsubscribes
   * themselves, and an admin has the whole roster in the guest search anyway.
   */
  const removeGuest = (player: PlayerOut, state: ResponseState) => {
    if (!player.is_guest || state !== "yes" || frozen) return null;
    return (
      <button
        onClick={() =>
          gate.requireAuth(() => {
            haptic("tap");
            clear.mutate(player.id);
          })
        }
        disabled={clear.isPending}
        aria-label={`Fjern ${player.name}`}
        className="shrink-0 rounded-pill border border-line px-2 py-1 text-[10px] font-semibold text-dim transition-colors active:text-chalk"
      >
        Fjern
      </button>
    );
  };

  return (
    <div className="space-y-5">
      <div className="rounded-card border border-line bg-ink-850/60 px-4 py-3">
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col">
            <span
              className={cn(
                "num-tight text-stat font-black leading-none",
                short ? "text-chalk" : "text-win",
              )}
            >
              {filled}
              <span className="text-stat-sm text-dim">/{event.capacity}</span>
            </span>
            <span className="mt-1 text-[9px] font-bold tracking-[0.12em] text-dim">
              PLADSER FYLDT
            </span>
          </div>
          <div className="text-right">
            <span
              className={cn(
                "num-tight text-stat font-black leading-none",
                short ? "text-volt" : "text-win",
              )}
            >
              {short ? missing : filled - event.capacity}
            </span>
            <span className="mt-1 block text-[9px] font-bold tracking-[0.12em] text-dim">
              {short ? "MANGLER" : filled === event.capacity ? "FYLDT OP" : "I KØ"}
            </span>
          </div>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-pill bg-ink-700">
          <div
            className={cn(
              "h-full rounded-pill transition-[width] duration-500 [transition-timing-function:var(--ease-out-expo)]",
              short ? "bg-volt" : "bg-win",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>

        <p className="mt-2 text-mini text-mute">
          {short
            ? `Vi mangler ${missing} for at fylde ${courtCount(event.capacity)}.`
            : filled === event.capacity
              ? `Der er fyldt op på ${courtCount(event.capacity)}.`
              : `${filled - event.capacity} står i kø til ${courtCount(event.capacity)}.`}
        </p>

        {/* Who the yeses are, not just how many. A Sunday held up by four
            guests is full and fragile, and the screen should say both. */}
        <div className="mt-2.5 flex items-center gap-1.5">
          <span className="rounded-pill border border-line bg-ink-900 px-2 py-1 text-[10px] font-semibold text-mute">
            <span className="num font-black text-chalk">{members}</span> fra holdet
          </span>
          <span className="rounded-pill border border-line bg-ink-900 px-2 py-1 text-[10px] font-semibold text-mute">
            <span className="num font-black text-chalk">{guests}</span>{" "}
            {guests === 1 ? "gæst" : "gæster"}
          </span>
        </div>
      </div>

      {!frozen ? (
        <div>
          <Button
            variant="solid"
            className="w-full"
            onClick={() => gate.requireAuth(() => setAddingGuest(true))}
          >
            Tag en gæst med
          </Button>
          <p className="mt-1.5 text-center text-[10px] leading-snug text-dim">
            Alle kan tage en gæst med. Søg på navnet — eller opret dem.
          </p>
        </div>
      ) : null}

      {/* Planning comes before the evening does: the kampe are set once the
          Sunday is full, and the aften is opened on the day. */}
      {isAdmin && !cancelled ? (
        <Button variant="solid" className="w-full" onClick={() => setPlanning(true)}>
          {event.matchups.length > 0 ? "Ret kampene" : "Sæt kampene"}
        </Button>
      ) : null}

      <TrainingPlan matchups={event.matchups} />

      <TrainingHandover event={event} isAdmin={isAdmin} />

      <AvailabilityList event={event} type="training" action={removeGuest} />

      {isAdmin ? <TrainingAdmin event={event} /> : null}

      {addingGuest ? (
        <TrainingGuestSheet event={event} open onOpenChange={setAddingGuest} />
      ) : null}
      {planning ? <TrainingPlanner event={event} open onOpenChange={setPlanning} /> : null}
    </div>
  );
}
