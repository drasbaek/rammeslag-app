"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useClearResponse, useSetResponseFor } from "@/lib/queries";
import { responseLabel } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { EventDetailOut, EventType, PlayerOut, ResponseState } from "@/lib/types";

/**
 * An admin writing somebody else's answer.
 *
 * Half the team answers in the group chat and never opens the app, so an
 * admin has always had to carry those names across by hand. The API has
 * allowed it for a while; this is the button.
 *
 * It is a sheet rather than inline buttons because the list it hangs off has
 * four groups and up to three states each, and thirty-odd tap targets on a
 * 390px column is a mis-tap waiting to change somebody's Sunday.
 *
 * What it writes is a tilmelding. It says so, it never says anything about
 * being picked, and it lives nowhere near "Udtaget" — an admin setting
 * "Klar" for Bo has not put Bo on the team sheet.
 */

/** A kamp asks three questions, a træning two. Mirrors ResponseToggle. */
const STATES: Record<EventType, ResponseState[]> = {
  match: ["yes", "maybe", "no"],
  training: ["yes", "no"],
};

const TONE: Record<ResponseState, string> = {
  yes: "border-win/60 bg-win/15 text-win",
  maybe: "border-draw/60 bg-draw/15 text-draw",
  no: "border-loss/60 bg-loss/15 text-loss",
};

/**
 * The row control: a quiet pill, and the sheet it opens.
 *
 * `state` is the answer on record, or `null` for somebody who has not
 * answered at all — which is the whole point of the control, because those
 * are the names an admin is chasing.
 */
export function ResponseOverride({
  event,
  type,
  player,
  state,
}: {
  event: EventDetailOut;
  type: EventType;
  player: PlayerOut;
  /** The answer on record, or null when there is no row for them yet. */
  state: ResponseState | null;
}) {
  const [open, setOpen] = useState(false);
  const answered = state !== null;

  return (
    <>
      <button
        onClick={() => {
          haptic("tap");
          setOpen(true);
        }}
        aria-label={`${answered ? "Ret" : "Sæt"} svar for ${player.name}`}
        className="shrink-0 rounded-pill border border-line px-2 py-1 text-[10px] font-semibold text-dim transition-colors active:text-chalk"
      >
        {answered ? "Ret" : "Sæt"}
      </button>
      {/* Mounted only while open, so a list of twenty names is not twenty
          idle mutations. */}
      {open ? (
        <ResponseOverrideSheet
          event={event}
          type={type}
          player={player}
          state={state}
          open
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  );
}

function ResponseOverrideSheet({
  event,
  type,
  player,
  state,
  open,
  onOpenChange,
}: {
  event: EventDetailOut;
  type: EventType;
  player: PlayerOut;
  state: ResponseState | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const answer = useSetResponseFor(event.id);
  const clear = useClearResponse(event.id);
  const [error, setError] = useState<string | null>(null);

  const states = STATES[type];
  const pending = answer.isPending || clear.isPending;

  const fail = (cause: Error) => {
    haptic("warn");
    setError(cause.message);
  };

  const done = () => {
    haptic("success");
    onOpenChange(false);
  };

  const choose = (next: ResponseState) => {
    // Two taps on the same pill is one answer, not two writes.
    if (pending) return;
    haptic("tap");
    setError(null);
    // The answer they already have is not a change. Close rather than spend
    // a request saying the same thing twice.
    if (next === state) {
      onOpenChange(false);
      return;
    }
    answer
      .mutateAsync({ playerId: player.id, state: next })
      .then(done)
      .catch(fail);
  };

  const reset = () => {
    if (pending || state === null) return;
    haptic("tap");
    setError(null);
    clear.mutate(player.id, { onSuccess: done, onError: fail });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title="Ret svar"
      description="Du retter en tilmelding. Hvem der spiller, bestemmes et andet sted."
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2.5 rounded-row border border-line bg-ink-900 px-2.5 py-2">
          <Avatar name={player.name} size="sm" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-semibold tracking-tight">
              {player.name}
            </span>
            <span className="truncate text-[10px] leading-tight text-dim">
              {state === null
                ? "Har ikke svaret endnu"
                : `Står som "${responseLabel(state, type)}"`}
            </span>
          </span>
        </div>

        <div>
          <span className="eyebrow block pb-1.5 text-mute">Sæt svaret til</span>
          <div
            role="group"
            aria-label={`Svar for ${player.name}`}
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${states.length}, minmax(0, 1fr))` }}
          >
            {states.map((option) => {
              const active = option === state;
              return (
                <button
                  key={option}
                  onClick={() => choose(option)}
                  disabled={pending}
                  aria-pressed={active}
                  className={cn(
                    "h-11 truncate rounded-row border px-2 text-mini font-bold tracking-tight transition-all duration-150 active:scale-[0.97] disabled:opacity-40",
                    active ? TONE[option] : "border-line bg-ink-850 text-dim",
                  )}
                >
                  {responseLabel(option, type)}
                </button>
              );
            })}
          </div>
        </div>

        {state !== null ? (
          <div>
            <Button
              variant="solid"
              className="w-full"
              disabled={pending}
              onClick={reset}
            >
              Tilbage til intet svar
            </Button>
            <p className="mt-1.5 text-center text-[10px] leading-snug text-dim">
              Svaret bliver slettet, som om der aldrig var svaret.
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-row border border-loss/30 bg-loss/10 px-3 py-2">
            <p className="text-mini text-loss">{error}</p>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
