"use client";

import { useAuthGate } from "@/components/auth/auth-gate";
import { useClearResponse, useMe, useSetMyResponse } from "@/lib/queries";
import { responseLabel } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { EventType, ResponseState } from "@/lib/types";

/**
 * Your own answer, as three buttons that are always all visible.
 *
 * Three, not a yes/no switch, because the old spreadsheet had three and the
 * third one carries real information: "Ved ikke" is a person who has seen the
 * question, which is different from a person who has not. Tapping the answer
 * you already gave clears it — back to silence, which is the fourth state and
 * the only one that is not a button.
 *
 * What this control does NOT say, anywhere, is that answering gets you on the
 * court. It records availability. Who plays is decided elsewhere and shown
 * elsewhere, and the two are never the same widget.
 */

const STATES: ResponseState[] = ["yes", "maybe", "no"];

/** A training asks a plainer question, so it only offers two of the three. */
const TRAINING_STATES: ResponseState[] = ["yes", "no"];

const TONE: Record<ResponseState, string> = {
  yes: "border-win/60 bg-win/15 text-win",
  maybe: "border-draw/60 bg-draw/15 text-draw",
  no: "border-loss/60 bg-loss/15 text-loss",
};

export function ResponseToggle({
  eventId,
  type,
  value,
  disabled = false,
  className,
}: {
  eventId: string;
  type: EventType;
  /** The caller's own answer, or null when they have not answered. */
  value: ResponseState | null;
  /** Aflyst, or locked and you are not an admin. */
  disabled?: boolean;
  className?: string;
}) {
  const gate = useAuthGate();
  const me = useMe();
  const respond = useSetMyResponse(eventId);
  // Clearing is the same endpoint as answering for someone else, pointed at
  // yourself: the API has one "remove this answer" route and no separate one.
  const clear = useClearResponse(eventId);
  const states = type === "training" ? TRAINING_STATES : STATES;
  const pending = respond.isPending || clear.isPending;

  const choose = (state: ResponseState) => {
    gate.requireAuth(() => {
      haptic("tap");
      if (state === value) {
        if (me.data) clear.mutate(me.data.id);
        return;
      }
      respond.mutate(state);
    });
  };

  return (
    <div
      role="group"
      aria-label="Kan du komme?"
      className={cn("grid gap-1.5", className)}
      style={{ gridTemplateColumns: `repeat(${states.length}, minmax(0, 1fr))` }}
    >
      {states.map((state) => {
        const active = state === value;
        return (
          <button
            key={state}
            onClick={() => choose(state)}
            disabled={disabled || pending}
            aria-pressed={active}
            className={cn(
              "h-11 truncate rounded-row border px-2 text-mini font-bold tracking-tight transition-all duration-150 active:scale-[0.97] disabled:opacity-40",
              active ? TONE[state] : "border-line bg-ink-850 text-dim",
            )}
          >
            {responseLabel(state, type)}
          </button>
        );
      })}
    </div>
  );
}
