"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { useAuthGate } from "@/components/auth/auth-gate";
import { useNewSession } from "@/components/session/new-session";
import { useMe, useSessions } from "@/lib/queries";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="Rammeslag FC, forside">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inset-0 rounded-full bg-volt" />
        <span className="absolute inset-0 rounded-full bg-volt/40 blur-[6px]" />
      </span>
      <span className="text-[13px] font-extrabold tracking-[0.22em] text-chalk">RAMMESLAG</span>
      <span className="text-[13px] font-extrabold tracking-[0.22em] text-dim">FC</span>
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
        <Wordmark />
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

const TABS = [
  { href: "/", label: "Stigen", icon: "ladder" },
  { href: "/sessions", label: "Sessioner", icon: "calendar" },
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
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden>
      <rect x="2.5" y="4" width="15" height="13.5" rx="3" stroke={stroke} strokeWidth="1.6" fill="none" />
      <path d="M2.5 8.5h15" stroke={stroke} strokeWidth="1.6" />
      <circle cx="7" cy="12.5" r="1.2" fill={stroke} />
      <circle cx="11.5" cy="12.5" r="1.2" fill={stroke} opacity="0.5" />
    </svg>
  );
}

/**
 * One tab. It fills its column and centres itself inside it, so the icon and
 * the label of one tab sit on the same axes as the other's at every width.
 */
function Tab({ tab, pathname }: { tab: (typeof TABS)[number]; pathname: string }) {
  const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);

  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-0 flex-col items-center gap-1 py-2 transition-colors",
        active ? "text-volt" : "text-dim",
      )}
    >
      <TabIcon name={tab.icon} active={active} />
      <span className="max-w-full truncate text-[10px] font-bold uppercase tracking-[0.12em]">
        {tab.label}
      </span>
    </Link>
  );
}

function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const gate = useAuthGate();
  const newSession = useNewSession();
  const sessions = useSessions();

  const openSession = sessions.data?.find((session) => session.status === "open");

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line-soft bg-ink-950/90 backdrop-blur-xl"
      style={{ paddingBottom: "var(--safe-b)" }}
    >
      {/* Three equal columns with the button in the middle one. The "+" is
          centred by the layout, not by an offset, and the two tabs are mirror
          images of each other around it — which is what makes the icons, the
          labels and the button read as one row instead of two groups. */}
      <div className="mx-auto grid h-16 w-full max-w-[520px] grid-cols-3 items-center px-2">
        <Tab tab={TABS[0]} pathname={pathname} />

        {/* The notch. Pinned to the middle column and lifted a fixed 20px above
            the tab row, so "raised" is a stated distance rather than the
            side-effect of a negative margin inside a centred grid. */}
        <div className="relative self-stretch">
          <button
            aria-label={openSession ? "Indtast kampe" : "Ny session"}
            onClick={() => {
              haptic("tap");
              // An evening in progress is the thing you meant. Otherwise there
              // is no evening yet, so the button starts one rather than leaving
              // the list to be read.
              if (openSession) {
                gate.requireAuth(() => router.push(`/sessions/${openSession.id}/entry`));
                return;
              }
              newSession.open();
            }}
            className="volt-glow absolute inset-x-0 -top-5 mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-volt text-volt-ink transition-transform active:scale-95"
          >
            <svg viewBox="0 0 20 20" className="h-6 w-6" aria-hidden>
              <path d="M10 3.5v13M3.5 10h13" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <Tab tab={TABS[1]} pathname={pathname} />
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
