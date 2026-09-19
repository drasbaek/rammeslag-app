import { cn } from "@/lib/utils";

/** Broadcast-style loading bar: a slow sweep across a flat block. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-row bg-ink-800", className)}>
      <div className="absolute inset-y-0 w-1/3 animate-sweep bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
    </div>
  );
}

export function RowSkeletons({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}
