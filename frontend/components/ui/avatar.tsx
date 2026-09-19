import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-[11px]",
  md: "h-11 w-11 text-mini",
  lg: "h-16 w-16 text-base",
} as const;

export function Avatar({
  name,
  size = "sm",
  accent = false,
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  accent?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border font-bold tracking-tight",
        accent
          ? "border-volt/40 bg-volt/15 text-volt"
          : "border-line bg-ink-700 text-mute",
        SIZES[size],
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
