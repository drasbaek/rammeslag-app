"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { SeasonForm } from "@/components/admin/season-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe, useSeasons } from "@/lib/queries";
import { seasonFor, seasonRange, todayISO } from "@/lib/seasons";
import { formatDateShort } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import type { SeasonOut } from "@/lib/types";

type Editing = { mode: "create" } | { mode: "edit"; season: SeasonOut } | null;

/**
 * The seasons admin, same plain furniture as the player screen: no accent
 * gradients, no oversized numerals, nothing that competes with the ladder.
 *
 * It exists because a session must fall inside a season. When the calendar
 * runs past the last season's end date, nobody can record tonight's training
 * until somebody adds the next one — so the screen says that out loud instead
 * of leaving the entry screen to fail.
 */
export default function AdminSeasonsPage() {
  const me = useMe();
  const seasons = useSeasons();
  const [editing, setEditing] = useState<Editing>(null);

  const isAdmin = me.data?.is_admin ?? false;
  const today = todayISO();
  const all = [...(seasons.data ?? [])].sort((a, b) => (a.starts_on < b.starts_on ? 1 : -1));
  const covering = seasonFor(all, today);

  if (!me.isPending && !isAdmin) {
    return (
      <div className="py-16 text-center">
        <p className="text-body font-semibold">Kun for administratorer.</p>
        <p className="mt-1 text-mini text-mute">Sæsonerne sættes af holdets admin.</p>
        <Link href="/" className="mt-5 inline-block text-mini font-semibold text-volt">
          Tilbage til stigen
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/"
        className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-dim"
      >
        <svg viewBox="0 0 8 12" className="h-3 w-2 rotate-180" aria-hidden>
          <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
        STIGEN
      </Link>

      <AdminTabs />

      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-[22px] font-black tracking-[-0.03em]">Sæsoner</h1>
        <span className="num text-[10px] tracking-[0.12em] text-dim">
          {all.length} I ALT
        </span>
      </div>
      <p className="mt-1 text-mini text-mute">
        En session hører altid til en sæson. Ligger datoen uden for dem alle, kan sessionen ikke
        oprettes.
      </p>

      {!seasons.isPending && !covering ? (
        <div className="mt-4 rounded-card border border-volt/30 bg-volt/[0.06] px-3 py-3">
          <p className="text-[13px] font-bold text-chalk">
            Ingen sæson dækker i dag ({formatDateShort(today)}).
          </p>
          <p className="mt-1 text-mini text-mute">
            Derfor kan der ikke oprettes en session for i aften. Opret sæsonen, så virker det igen.
          </p>
        </div>
      ) : null}

      <Button
        variant={covering ? "solid" : "volt"}
        className="mt-4 w-full"
        onClick={() => {
          haptic("tap");
          setEditing({ mode: "create" });
        }}
      >
        Opret sæson
      </Button>

      {seasons.isPending ? (
        <div className="mt-5 space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <section className="mt-5">
          <h2 className="eyebrow px-1 pb-1">Alle sæsoner</h2>
          <div className="rounded-card border border-line-soft bg-ink-850/40 px-2">
            {all.map((season) => (
              <button
                key={season.id}
                onClick={() => {
                  haptic("tap");
                  setEditing({ mode: "edit", season });
                }}
                className="flex w-full items-center gap-3 border-b border-line-soft px-1 py-2.5 text-left last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold">{season.name}</span>
                    {season.is_current ? (
                      <span className="shrink-0 rounded-[3px] border border-volt/40 px-1 py-[1px] text-[9px] font-bold tracking-[0.1em] text-volt">
                        NU
                      </span>
                    ) : null}
                  </span>
                  <span className="num block text-[10px] text-dim">{seasonRange(season)}</span>
                </span>
                <svg viewBox="0 0 8 12" className="h-3 w-2 shrink-0 text-dim" aria-hidden>
                  <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
                </svg>
              </button>
            ))}
            {all.length === 0 ? (
              <p className="py-5 text-center text-mini text-dim">Ingen sæsoner endnu.</p>
            ) : null}
          </div>
        </section>
      )}

      {seasons.isError ? (
        <p className="py-10 text-center text-mini text-loss">Kunne ikke hente sæsonerne.</p>
      ) : null}

      {editing ? (
        <SeasonForm
          key={editing.mode === "edit" ? editing.season.id : "create"}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          season={editing.mode === "edit" ? editing.season : null}
        />
      ) : null}
    </div>
  );
}
