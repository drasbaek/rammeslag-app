"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-pill font-semibold transition-all duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt/70",
  {
    variants: {
      variant: {
        volt: "bg-volt text-volt-ink shadow-[0_10px_30px_-14px_var(--color-volt)]",
        solid: "bg-ink-700 text-chalk border border-line",
        ghost: "bg-transparent text-mute hover:text-chalk",
        danger: "bg-loss/15 text-loss border border-loss/30",
      },
      size: {
        sm: "h-9 px-4 text-mini",
        md: "h-11 px-5 text-body",
        lg: "h-14 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "solid", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(button({ variant, size }), className)} {...props} />;
}
