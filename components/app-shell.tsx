"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Mark, Wordmark } from "@/components/brand";
import { useAuthGate } from "@/components/auth/auth-gate";
import { useQuickAdd } from "@/components/quick-add";
import { useMe } from "@/lib/queries";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * The real logo, unpacked into a horizontal lockup. The square original stacks
 * the wordmark under the monogram, which would need most of a 56px bar to stay
 * legible; side by side the monogram gets its full height and the wordmark sits
 * on the bar's optical centre. Nothing is tinted: the club's mark is white, and
 * the volt accent belongs to the numbers.
 */
function Lockup() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Rammeslag FC, forside">
      <Mark height={28} priority />
      <Wordmark height={11} priority />
    </Link>
  );
}

function AdminLink() {
  return (
    <Link
      href="/admin/players"
      aria-label="Spillere"
      className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-dim transition-colors active:text-chalk"
    >
      <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden>
        <circle cx="6.6" cy="6" r="2.6" stroke="currentColor" strokeWidth="1.4" fill="none" />
        <path d="M2 15c0-2.5 2-4.2 4.6-4.2S11.2 12.5 11.2 15" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        <path d="M12.4 4.4a2.3 2.3 0 010 4.4M13.6 15c0-2-.7-3.4-1.8-4.3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </svg>
    </Link>
  );
}

function TopBar() {
  const me = useMe();
  const gate = useAuthGate();
  const player = me.data ?? null;

  return (
    <header
      className="sticky top-0 z-30 border-b border-line-soft bg-ink-950/85 backdrop-blur-xl"
      style={{ paddingTop: "var(--safe-t)" }}
    >
      <div className="mx-auto flex h-14 w-full max-w-[520px] items-center justify-between gap-2 px-4">
        <Lockup />
        {player ? (
          <div className="flex items-center gap-2">
            {player.is_admin ? <AdminLink /> : null}
            <Link href={`/players/${player.id}`} aria-label="Min profil">
              <Avatar name={player.name} size="sm" accent />
            </Link>
          </div>
        ) : (
          <button
            onClick={() => gate.openLogin()}
            className="rounded-pill border border-line px-3 py-1.5 text-micro font-semibold tracking-wide text-mute transition-colors active:text-chalk"
          >
            LOG IND
          </button>
        )}
      </div>
    </header>
  );
}

/**
 * Four tabs around the "+". Two to the left, two to the right, so the button
 * stays in the optical middle as the app grows.
 *
 * "Træningshistorik" was the old label and it no longer fits: at five columns
 * a tab is about 75px, which is eight characters at 9px. It is "Historik"
 * now, and the screen it opens still says the long name at the top.
 *
 * Bødekasse is here before it exists. A disabled tab is a promise the layout
 * has to keep anyway — adding the fifth column later would re-space the other
 * four and move every tab under the thumb that had learned where it was.
 */
const TABS = [
  { href: "/", label: "Stigen", icon: "ladder", ready: true },
  { href: "/program", label: "Program", icon: "calendar", ready: true },
  { href: "/sessions", label: "Historik", icon: "history", ready: true },
  { href: "/boedekasse", label: "Bødekasse", icon: "coin", ready: false },
] as const;

function TabIcon({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? "var(--color-volt)" : "currentColor";
  if (name === "ladder") {
    return (
      <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden>
        <rect x="2.5" y="10" width="4" height="7" rx="1" fill={stroke} opacity={active ? 1 : 0.65} />
        <rect x="8" y="5.5" width="4" height="11.5" rx="1" fill={stroke} />
        <rect x="13.5" y="12.5" width="4" height="4.5" rx="1" fill={stroke} opacity={active ? 1 : 0.65} />
      </svg>
    );
  }
  if (name === "calendar") {
    return (
      <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden>
        <rect x="2.5" y="4" width="15" height="13.5" rx="3" stroke={stroke} strokeWidth="1.6" fill="none" />
        <path d="M2.5 8.5h15M6.5 2.5v3M13.5 2.5v3" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="7" cy="12.5" r="1.2" fill={stroke} />
        <circle cx="11.5" cy="12.5" r="1.2" fill={stroke} opacity="0.5" />
      </svg>
    );
  }
  if (name === "coin") {
    return (
      <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden>
        <circle cx="10" cy="10" r="7" stroke={stroke} strokeWidth="1.6" fill="none" />
        <path d="M12 7.3a2.6 2.6 0 00-4.3 1.9c0 2.4 4.3 1.1 4.3 3.4A2.6 2.6 0 018 13.9M10 5.6v1.2M10 13.2v1.2" stroke={stroke} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  // History: the clock that has been round once already.
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden>
      <path d="M3.2 10a6.8 6.8 0 106.8-6.8A6.8 6.8 0 004.4 5.6" stroke={stroke} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M2.6 2.9v3h3" stroke={stroke} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 6.3V10l2.5 1.6" stroke={stroke} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * One tab. It fills its column and centres itself inside it, so the icon and
 * the label of one tab sit on the same axes as the other's at every width.
 */
function Tab({ tab, pathname }: { tab: (typeof TABS)[number]; pathname: string }) {
  const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);

  const inner = (
    <>
      <TabIcon name={tab.icon} active={active} />
      <span className="max-w-full truncate text-[9px] font-bold uppercase tracking-[0.04em]">
        {tab.label}
      </span>
    </>
  );

  // A tab with nothing behind it yet is dimmed and inert rather than hidden.
  // Tapping it and landing on an empty screen would be worse than seeing that
  // it is not ready.
  if (!tab.ready) {
    return (
      <span
        aria-disabled
        title="Kommer senere"
        className="flex min-w-0 flex-col items-center gap-1 py-2 text-dim opacity-40"
      >
        {inner}
      </span>
    );
  }

  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-0 flex-col items-center gap-1 py-2 transition-colors",
        active ? "text-volt" : "text-dim",
      )}
    >
      {inner}
    </Link>
  );
}

function BottomNav() {
  const pathname = usePathname();
  const quickAdd = useQuickAdd();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line-soft bg-ink-950/90 backdrop-blur-xl"
      style={{ paddingBottom: "var(--safe-b)" }}
    >
      {/* Five equal columns with the button in the middle one. The "+" is
          centred by the layout, not by an offset, and the tabs are mirror
          images of each other around it — which is what makes the icons, the
          labels and the button read as one row instead of two groups. */}
      <div className="mx-auto grid h-16 w-full max-w-[520px] grid-cols-5 items-center px-1">
        <Tab tab={TABS[0]} pathname={pathname} />
        <Tab tab={TABS[1]} pathname={pathname} />

        {/* The notch. Pinned to the middle column and lifted a fixed 20px above
            the tab row, so "raised" is a stated distance rather than the
            side-effect of a negative margin inside a centred grid. */}
        <div className="relative self-stretch">
          <button
            aria-label="Tilføj"
            onClick={() => {
              haptic("tap");
              // More than one thing can be created now, so the button asks
              // instead of guessing. The evening in progress is the first row
              // of the menu, which is where the guess went.
              quickAdd.openMenu();
            }}
            className="volt-glow absolute inset-x-0 -top-5 mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-volt text-volt-ink transition-transform active:scale-95"
          >
            <svg viewBox="0 0 20 20" className="h-6 w-6" aria-hidden>
              <path d="M10 3.5v13M3.5 10h13" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <Tab tab={TABS[2]} pathname={pathname} />
        <Tab tab={TABS[3]} pathname={pathname} />
      </div>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="ground flex min-h-dvh flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-[520px] flex-1 px-4 pb-28 pt-4">{children}</main>
      <BottomNav />
    </div>
  );
}
