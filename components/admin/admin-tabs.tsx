"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/players", label: "Spillere" },
  { href: "/admin/seasons", label: "Sæsoner" },
] as const;

/** Two plain tabs across the admin area. Deliberately dull furniture. */
export function AdminTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-4 flex gap-2">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-pill border px-3 py-1.5 text-mini font-semibold transition-colors",
              active ? "border-line bg-ink-700 text-chalk" : "border-line-soft text-dim",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
