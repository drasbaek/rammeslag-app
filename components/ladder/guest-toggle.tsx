"use client";

import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * Guests are hidden by default. Fifteen of them sit in a 160-point clump
 * around 1000 with one to three matches each, and dropping that into the
 * middle of the team's ladder buries the six people who are actually racing
 * each other. The switch says how many are behind it so it is never a mystery.
 */
export function GuestToggle({
  on,
  onChange,
  guestCount,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  guestCount: number;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => {
        haptic("tap");
        onChange(!on);
      }}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-pill border px-3 py-2 text-left transition-colors",
        on ? "border-volt/35 bg-volt/[0.07]" : "border-line bg-ink-850/60",
      )}
    >
      <span
        className={cn(
          "relative h-4 w-7 shrink-0 rounded-pill transition-colors duration-200",
          on ? "bg-volt" : "bg-ink-600",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "absolute top-[2px] h-3 w-3 rounded-full bg-ink-950 transition-transform duration-200 [transition-timing-function:var(--ease-out-expo)]",
            on ? "translate-x-[14px]" : "translate-x-[2px]",
          )}
        />
      </span>

      <span className={cn("flex-1 text-mini font-semibold", on ? "text-chalk" : "text-mute")}>
        Vis gæster
      </span>

      <span className="num shrink-0 text-[10px] tracking-[0.12em] text-dim">
        {guestCount > 0 ? `${guestCount} PÅ BESØG` : ""}
      </span>
    </button>
  );
}
