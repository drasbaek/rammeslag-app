"use client";

import type { PlayerOut } from "@/lib/types";
import { nameParts } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * Who is at the hall tonight, asked once.
 *
 * Same tile as the line-up grid — stacked given name over surname, two across
 * a 390px screen — but the answer is a set rather than an order, so the marker
 * is a tick and not an A or a B. Every name the team has is on this screen
 * exactly once, and after it the line-up grid is eight tiles instead of
 * eighteen, which is the whole point of asking.
 */
export function AttendancePicker({
  roster,
  present,
  onToggle,
}: {
  roster: PlayerOut[];
  present: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {roster.map((player) => {
        const here = present.includes(player.id);
        const { given, family } = nameParts(player.name);
        return (
          <button
            key={player.id}
            onClick={() => {
              haptic("tap");
              onToggle(player.id);
            }}
            aria-pressed={here}
            aria-label={player.name}
            className={cn(
              "flex h-[54px] items-center gap-2 rounded-row border px-2.5 text-left transition-all duration-150 active:scale-[0.98]",
              here ? "border-volt/50 bg-volt/[0.08]" : "border-line bg-ink-850 opacity-75",
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                here ? "border-volt bg-volt text-volt-ink" : "border-ink-600 text-transparent",
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
                    here ? "text-mute" : "text-dim",
                  )}
                >
                  {given}
                </span>
              ) : null}
              <span
                className={cn(
                  "truncate text-[14px] font-bold tracking-tight",
                  given ? "mt-[3px]" : "",
                  here ? "text-chalk" : "text-mute",
                )}
              >
                {family}
              </span>
            </span>
            {/* One letter, same as the ladder: at 390px the word costs four
                characters of somebody's actual name. */}
            {player.is_guest ? (
              <span
                className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border border-ink-500 text-[9px] font-black text-dim"
                title="Gæst"
                aria-label="Gæst"
              >
                G
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
