import { delta as formatDelta } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Delta({
  value,
  decimals = 1,
  className,
}: {
  value: number;
  decimals?: number;
  className?: string;
}) {
  const tone = value > 0.05 ? "text-win" : value < -0.05 ? "text-loss" : "text-flat";
  return <span className={cn("num font-semibold", tone, className)}>{formatDelta(value, decimals)}</span>;
}
