import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Broadcast section header: a volt tick, a tight label, an optional right slot. */
export function SectionHeader({
  title,
  right,
  className,
}: {
  title: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-3 px-1 pb-2", className)}>
      <div className="flex items-center gap-2">
        <span className="h-3 w-[3px] rounded-full bg-volt" aria-hidden />
        <h2 className="eyebrow text-mute">{title}</h2>
      </div>
      {right}
    </div>
  );
}
