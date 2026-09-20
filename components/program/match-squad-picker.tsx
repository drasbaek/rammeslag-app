"use client";

import { useMemo, useState } from "react";
import {
  SQUAD_STATES,
  SQUAD_STATE_DOT,
  SQUAD_STATE_TEXT,
  candidates,
  squadStateLabel,
  stateKey,
} from "@/components/program/match-roster";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section";
import { Sheet } from "@/components/ui/sheet";
import { useSetSelection } from "@/lib/queries";
import { nameParts } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { EventDetailOut } from "@/lib/types";

/**
 * The team sheet, written by the one person who decides it.
 *
 * Every name the date knows about is here with the answer that name gave, so
 * the decision is made with the information in front of it instead of from
 * memory. The answer is shown, never obeyed: picking somebody who said "ikke
 * klar" is allowed, because half this team says yes in the group chat and
 * never opens the app. It is flagged rather than blocked — the admin is
 * telling the app something, not making a mistake.
 *
 * The whole squad is saved in one write, the same way it is decided. There is
 * no per-name save, because a half-picked team is not a state anybody wants
 * the screen to be able to show.
 */
export function MatchSquadPicker({
  event,
  open,
  onOpenChange,
}: {
  event: EventDetailOut;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSetSelection(event.id);
  const [picked, setPicked] = useState<string[]>(() => event.selected.map((p) => p.id));
  const [error, setError] = useState<string | null>(null);

  const people = useMemo(() => candidates(event), [event]);
  const stateById = useMemo(
    () => new Map(people.map((row) => [row.player.id, row.state])),
    [people],
  );

  const groups = SQUAD_STATES.map((state) => ({
    state,
    people: people.filter((row) => row.state === state),
  })).filter((group) => group.people.length > 0);

  // Picked without having said klar. Counted out loud further down, because a
  // squad the app quietly accepted would be a squad nobody checked.
  const unconfirmed = picked.filter((id) => stateById.get(id) !== "yes").length;
  const over = picked.length - event.capacity;

  const toggle = (id: string) => {
    haptic("tap");
    setError(null);
    setPicked((current) =>
      current.includes(id) ? current.filter((other) => other !== id) : [...current, id],
    );
  };

  const submit = () => {
    save
      .mutateAsync({ player_ids: picked })
      .then(() => {
        haptic("success");
        onOpenChange(false);
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
      title={event.selected.length > 0 ? "Ret holdet" : "Sæt holdet"}
      description="Svarene står ud for navnene. De er en tilmelding — du udtager."
    >
      <div className="space-y-4">
        {groups.map(({ state, people: group }) => (
          <div key={stateKey(state)}>
            <SectionHeader
              title={squadStateLabel(state)}
              right={
                <span
                  className={cn(
                    "num text-[13px] font-black",
                    SQUAD_STATE_TEXT[stateKey(state)],
                  )}
                >
                  {group.length}
                </span>
              }
            />
            <div className="space-y-1.5">
              {group.map(({ player }) => {
                const on = picked.includes(player.id);
                const flagged = on && state !== "yes";
                const { given, family } = nameParts(player.name);
                return (
                  <button
                    key={player.id}
                    onClick={() => toggle(player.id)}
                    aria-pressed={on}
                    aria-label={`${player.name} · ${squadStateLabel(state)}`}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-row border px-2.5 py-2 text-left transition-all duration-150 active:scale-[0.99]",
                      on
                        ? flagged
                          ? "border-draw/50 bg-draw/[0.08]"
                          : "border-volt/50 bg-volt/[0.08]"
                        : "border-line bg-ink-900",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                        on
                          ? flagged
                            ? "border-draw bg-draw text-ink-950"
                            : "border-volt bg-volt text-volt-ink"
                          : "border-ink-600 text-transparent",
                      )}
                    >
                      <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
                        <path
                          d="M2 6.4l2.6 2.6L10 3.6"
                          stroke="currentColor"
                          strokeWidth="2"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>

                    <span className="flex min-w-0 flex-1 flex-col leading-none">
                      {given ? (
                        <span
                          className={cn(
                            "truncate text-[10px] font-semibold tracking-tight",
                            on ? "text-mute" : "text-dim",
                          )}
                        >
                          {given}
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "truncate text-[14px] font-bold tracking-tight",
                          given ? "mt-[3px]" : "",
                          on ? "text-chalk" : "text-mute",
                        )}
                      >
                        {family}
                      </span>
                    </span>

                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        SQUAD_STATE_DOT[stateKey(state)],
                      )}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* The tally the sheet is judged on, and the only place the word
            "udtaget" is allowed to appear next to a name. */}
        <div className="flex items-center gap-3 rounded-card border border-line bg-ink-900 px-3 py-2.5">
          <span className="num-tight text-stat-sm font-black leading-none">
            {picked.length}
            <span className="text-[13px] text-dim">/{event.capacity}</span>
          </span>
          <span className="text-[9px] font-bold tracking-[0.12em] text-dim">UDTAGET</span>
          <span className="ml-auto text-right text-[10px] leading-snug text-dim">
            {over > 0
              ? `${over} for mange til ${event.capacity} pladser.`
              : over < 0
                ? `Der mangler ${-over}.`
                : "Holdet er fuldt."}
          </span>
        </div>

        {unconfirmed > 0 ? (
          <div className="rounded-card border border-draw/30 bg-draw/[0.07] px-3 py-2.5">
            <p className="text-[13px] font-bold text-chalk">
              {unconfirmed === 1
                ? "1 på holdet har ikke meldt sig klar."
                : `${unconfirmed} på holdet har ikke meldt sig klar.`}
            </p>
            <p className="mt-1 text-mini text-mute">
              Det må du godt. Men de har ikke sagt ja i appen, så sig det til dem.
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-row border border-loss/30 bg-loss/10 px-3 py-2">
            <p className="text-mini text-loss">{error}</p>
          </div>
        ) : null}

        <Button
          variant="volt"
          size="lg"
          className="w-full"
          disabled={save.isPending}
          onClick={submit}
        >
          {save.isPending ? "Gemmer…" : "Gem holdet"}
        </Button>
        <p className="text-center text-[10px] leading-snug text-dim">
          Holdet gemmes som ét valg. Svarene bliver stående, som de er.
        </p>
      </div>
    </Sheet>
  );
}
