"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { PlayerForm } from "@/components/admin/player-form";
import { useMe, usePlayers } from "@/lib/queries";
import { rating as formatRating } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import type { PlayerOut } from "@/lib/types";

type Editing = { mode: "create" } | { mode: "edit"; player: PlayerOut } | null;

/**
 * An occasional settings screen. Deliberately plain: no accent gradients, no
 * oversized numerals, nothing that competes with the ladder. It exists because
 * docs/RATING.md requires a human to set an entry rating, and because guests
 * become members.
 */
export default function AdminPlayersPage() {
  const me = useMe();
  const players = usePlayers();
  const [editing, setEditing] = useState<Editing>(null);

  const isAdmin = me.data?.is_admin ?? false;
  const isMember = Boolean(me.data);
  const all = players.data ?? [];
  const members = all.filter((p) => !p.is_guest);
  const guests = all.filter((p) => p.is_guest);

  if (!me.isPending && !isMember) {
    return (
      <div className="py-16 text-center">
        <p className="text-body font-semibold">Log ind for at rette spillere.</p>
        <p className="mt-1 text-mini text-mute">Alle på holdet kan rette listen.</p>
        <Link href="/" className="mt-5 inline-block text-mini font-semibold text-volt">
          Tilbage til stigen
        </Link>
      </div>
    );
  }

  const Row = ({ player }: { player: PlayerOut }) => (
    <button
      onClick={() => {
        haptic("tap");
        setEditing({ mode: "edit", player });
      }}
      className="flex w-full items-center gap-3 border-b border-line-soft px-1 py-2.5 text-left last:border-b-0"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold">{player.name}</span>
        {/* GET /api/players returns PlayerOut, which does not say who is an
            admin — so this line does not pretend to know. */}
        <span className="text-[10px] text-dim">{player.is_guest ? "Gæst" : "Medlem"}</span>
      </span>
      {isAdmin ? (
        <span className="shrink-0 text-right">
          <span className="num block text-[13px] font-bold tabular-nums">
            {formatRating(player.entry_rating)}
          </span>
          <span className="block text-[9px] tracking-[0.1em] text-dim">INDGANG</span>
        </span>
      ) : null}
      <svg viewBox="0 0 8 12" className="h-3 w-2 shrink-0 text-dim" aria-hidden>
        <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
    </button>
  );

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
        <h1 className="text-[22px] font-black tracking-[-0.03em]">Spillere</h1>
        <span className="num text-[10px] tracking-[0.12em] text-dim">
          {members.length} MEDLEMMER · {guests.length} GÆSTER
        </span>
      </div>
      <p className="mt-1 text-mini text-mute">
        {isAdmin
          ? "Indgangsratingen er et skøn, ikke en formel. Den kan rettes bagefter — hele historikken spilles om."
          : "Alle på holdet kan tilføje og rette spillere. Indgangsratingen er holdets admins."}
      </p>

      <Button
        variant="solid"
        className="mt-4 w-full"
        onClick={() => {
          haptic("tap");
          setEditing({ mode: "create" });
        }}
      >
        Tilføj spiller
      </Button>

      {players.isPending ? (
        <div className="mt-5 space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <>
          <section className="mt-5">
            <h2 className="eyebrow px-1 pb-1">Medlemmer</h2>
            <div className="rounded-card border border-line-soft bg-ink-850/40 px-2">
              {members.map((player) => (
                <Row key={player.id} player={player} />
              ))}
            </div>
          </section>

          <section className="mt-5">
            <h2 className="eyebrow px-1 pb-1">Gæster</h2>
            <div className="rounded-card border border-line-soft bg-ink-850/40 px-2">
              {guests.map((player) => (
                <Row key={player.id} player={player} />
              ))}
              {guests.length === 0 ? (
                <p className="py-5 text-center text-mini text-dim">Ingen gæster endnu.</p>
              ) : null}
            </div>
          </section>
        </>
      )}

      {editing ? (
        <PlayerForm
          key={editing.mode === "edit" ? editing.player.id : "create"}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          player={editing.mode === "edit" ? editing.player : null}
        />
      ) : null}
    </div>
  );
}
