"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Two- or three-way toggle. The active pill slides — this is the control that
 * flips the ladder between all-time and season, so the motion matters.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const id = useId();
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  return (
    <div
      role="tablist"
      aria-label="Visning"
      className={cn(
        "relative grid w-full gap-1 rounded-pill border border-line bg-ink-850 p-1",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 left-1 rounded-pill bg-ink-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform duration-300 [transition-timing-function:var(--ease-out-expo)]"
        style={{
          width: `calc((100% - 0.5rem - ${(options.length - 1) * 0.25}rem) / ${options.length})`,
          transform: `translateX(calc(${index} * (100% + 0.25rem)))`,
        }}
      />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            id={`${id}-${option.value}`}
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (!active) haptic("tap");
              onChange(option.value);
            }}
            className={cn(
              "relative z-10 truncate rounded-pill px-3 py-2 text-mini font-semibold tracking-wide transition-colors duration-200",
              active ? "text-chalk" : "text-dim",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
