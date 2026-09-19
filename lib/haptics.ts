/** Short vibration patterns. Silently no-ops where the API is absent (iOS Safari). */
type Pattern = "tap" | "success" | "warn";

const PATTERNS: Record<Pattern, number | number[]> = {
  tap: 8,
  success: [12, 40, 22],
  warn: [30, 60, 30],
};

export function haptic(pattern: Pattern = "tap"): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Some browsers throw when the document is not focused.
  }
}
