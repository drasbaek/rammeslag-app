"use client";

import type { PlayerOut } from "@/lib/types";
import { firstName } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * The roster stays on screen between matches. Tapping four names in order sets
 * Hold A (first two) and Hold B (last two) — no drag, no dropdowns.
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
        return (
          <button
            key={player.id}
            onClick={() => {
              haptic("tap");
              onToggle(player.id);
            }}
            className={cn(
              "flex h-12 items-center gap-2 rounded-row border px-2.5 text-left transition-all duration-150 active:scale-[0.98]",
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
            <span className={cn("min-w-0 flex-1 truncate text-[13px] font-bold tracking-tight", picked ? "text-chalk" : "text-mute")}>
              {firstName(player.name)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
