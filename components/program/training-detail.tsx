"use client";

import { AvailabilityList } from "@/components/program/availability-list";
import { courtCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EventDetailOut } from "@/lib/types";

/**
 * A Sunday: how full it is, and who is coming.
 *
 * The number that matters is places filled against places booked, because
 * that is the number the group chat is really asking about — are we enough,
 * or do we need to find a guest.
 *
 * OWNED BY THE TRÆNING AGENT. The guest search, the admin baner controls, the
 * match-up planner and the "opret træning" handover land here; the foundation
 * ships the read-only version so the feature works end to end from day one.
 */
export function TrainingDetail({ event }: { event: EventDetailOut }) {
  const filled = event.counts.yes;
  const short = filled < event.capacity;
  // Never past 100%: a Sunday that is oversubscribed is full, plus a queue.
  const pct = Math.min(100, Math.round((filled / Math.max(1, event.capacity)) * 100));

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
          <span className="text-mini text-mute">{courtCount(event.capacity)}</span>
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
            ? `Vi mangler ${event.capacity - filled} for at fylde ${courtCount(event.capacity)}.`
            : filled === event.capacity
              ? "Der er fyldt op."
              : `${filled - event.capacity} står i kø.`}
        </p>
      </div>

      <AvailabilityList event={event} type="training" />
    </div>
  );
}
