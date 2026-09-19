import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The type scale in `app/globals.css` uses names, not numbers — `text-hero`,
 * `text-stat`, `text-mini`. tailwind-merge cannot tell those from a colour
 * (`text-volt` has exactly the same shape), so out of the box it treats
 * `text-hero` as a colour and the later `text-volt` wins, silently collapsing
 * every oversized numeral in the app to the base size. Naming the scale fixes
 * it.
 */
const FONT_SIZES = [
  "eyebrow",
  "micro",
  "mini",
  "body",
  "stat-sm",
  "stat",
  "hero",
  "mega",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...FONT_SIZES] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
