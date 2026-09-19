import type { Verdict } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Three states, three colours. A draw is amber rather than grey: grey is what
 * an empty slot uses, and a night that ended level is not a night that was
 * never played.
 */
const TONE: Record<Verdict, string> = {
  W: "bg-win/90",
  L: "bg-loss/85",
  D: "bg-draw/90",
};

const LABEL: Record<Verdict, string> = {
  W: "sejr",
  L: "nederlag",
  D: "uafgjort",
};

/**
 * Last five verdicts, oldest first. Empty slots are drawn so a short career
 * reads as a short career rather than as bad form.
 */
export function FormDots({
  form,
  size = "sm",
  className,
}: {
  form: Verdict[];
  size?: "sm" | "md";
  className?: string;
}) {
  const slots = [...Array(Math.max(0, 5 - form.length)).fill(null), ...form] as (Verdict | null)[];
  const box = size === "md" ? "h-2.5 w-4" : "h-1.5 w-3";

  return (
    <div className={cn("flex items-center gap-[3px]", className)} aria-label="Form, seneste fem">
      {slots.map((verdict, i) => (
        <span
          key={i}
          title={verdict ? LABEL[verdict] : "ingen kamp"}
          className={cn(
            "rounded-[2px] transition-colors",
            box,
            verdict ? TONE[verdict] : "bg-ink-600",
            i === slots.length - 1 && verdict ? "ring-1 ring-white/25" : "",
          )}
        />
      ))}
    </div>
  );
}
