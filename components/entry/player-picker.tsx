"use client";

import type { PlayerOut } from "@/lib/types";
import { nameParts } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * The roster stays on screen between matches. Tapping four names in order sets
 * Hold A (first two) and Hold B (last two) — no drag, no dropdowns.
 *
 * The full name is on the tile, because this is the team that calls each other
 * by their surnames. It is stacked rather than written on one line: two tiles
 * across a 390px screen leave about 120px for text, and an 18-character name
 * on one line is an ellipsis waiting to happen. Given name quiet on top,
 * surname loud underneath — nobody is picked from a truncation.
 */
export function PlayerPicker({
  roster,
  selected,
  onToggle,
}: {
  roster: PlayerOut[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {roster.map((player) => {
        const index = selected.indexOf(player.id);
        const picked = index >= 0;
        const team = index < 2 ? "A" : "B";
        const { given, family } = nameParts(player.name);
        return (
          <button
            key={player.id}
            onClick={() => {
              haptic("tap");
              onToggle(player.id);
            }}
            aria-pressed={picked}
            aria-label={player.name}
            className={cn(
              "flex h-[54px] items-center gap-2 rounded-row border px-2.5 text-left transition-all duration-150 active:scale-[0.98]",
              picked
                ? team === "A"
                  ? "border-volt/60 bg-volt/10"
                  : "border-chalk/25 bg-ink-700"
                : "border-line bg-ink-850 opacity-80",
            )}
          >
            <span
              className={cn(
                "num flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black",
                picked
                  ? team === "A"
                    ? "bg-volt text-volt-ink"
                    : "bg-chalk text-ink-950"
                  : "border border-ink-600 text-dim",
              )}
            >
              {picked ? team : ""}
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-none">
              {given ? (
                <span
                  className={cn(
                    "truncate text-[10px] font-semibold tracking-tight",
                    picked ? "text-mute" : "text-dim",
                  )}
                >
                  {given}
                </span>
              ) : null}
              <span
                className={cn(
                  "truncate text-[14px] font-bold tracking-tight",
                  given ? "mt-[3px]" : "",
                  picked ? "text-chalk" : "text-mute",
                )}
              >
                {family}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
