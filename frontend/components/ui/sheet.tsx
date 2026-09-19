"use client";

import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Bottom sheet. Phone-first: it rises from the bottom and respects safe areas. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade bg-ink-950/85 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[520px] rounded-t-[28px] border border-line bg-ink-850 shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.9)] focus:outline-none",
            "animate-rise",
            className,
          )}
          style={{ paddingBottom: "calc(20px + var(--safe-b))" }}
        >
          <div className="mx-auto mt-3 h-1 w-10 rounded-pill bg-ink-500" aria-hidden />
          <div className="px-5 pt-4">
            <Dialog.Title className="text-lg font-bold tracking-tight">{title}</Dialog.Title>
            {description ? (
              <Dialog.Description className="mt-1 text-mini text-mute">{description}</Dialog.Description>
            ) : (
              <Dialog.Description className="sr-only">{title}</Dialog.Description>
            )}
          </div>
          <div className="px-5 pb-2 pt-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
