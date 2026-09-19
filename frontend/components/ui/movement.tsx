import { cn } from "@/lib/utils";

/** Rank movement since the previous evening. Null means new to this ladder. */
export function Movement({ movement, className }: { movement: number | null; className?: string }) {
  if (movement === null) {
    return (
      <span className={cn("num text-[10px] font-bold tracking-widest text-volt/70", className)}>
        NY
      </span>
    );
  }

  if (movement === 0) {
    return (
      <span className={cn("block h-[2px] w-2.5 rounded-full bg-ink-500", className)} aria-label="uændret" />
    );
  }

  const up = movement > 0;
  return (
    <span
      className={cn("flex items-center gap-[2px] text-[11px] font-bold", up ? "text-win" : "text-loss", className)}
      aria-label={`${up ? "op" : "ned"} ${Math.abs(movement)} pladser`}
    >
      <svg viewBox="0 0 10 7" className={cn("h-[6px] w-[9px]", up ? "" : "rotate-180")} aria-hidden>
        <path d="M5 0 10 7H0z" fill="currentColor" />
      </svg>
      <span className="num">{Math.abs(movement)}</span>
    </span>
  );
}
