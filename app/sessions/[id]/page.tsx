"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Wordmark } from "@/components/brand";
import { MatchCard } from "@/components/session/match-card";
import { MovementBars } from "@/components/session/movement-bars";
import { Recap } from "@/components/session/recap";
import { SessionForm } from "@/components/session/session-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthGate } from "@/components/auth/auth-gate";
import { useSession } from "@/lib/queries";
import { participants, sessionStandings } from "@/lib/session-stats";
import { formatDateShort, matchCount, sessionTypeLabel, weekdayShort } from "@/lib/format";
import { haptic } from "@/lib/haptics";

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const gate = useAuthGate();
  const session = useSession(id);
  const [editing, setEditing] = useState(false);
  const data = session.data;

  // The endpoint hands over the matches and a three-line recap; who played and
  // how the evening moved are sums over those matches.
  const matches = useMemo(() => data?.matches ?? [], [data?.matches]);
  const standings = useMemo(() => sessionStandings(matches), [matches]);
  const squad = useMemo(() => participants(matches), [matches]);

  return (
    <div>
      <Link
        href="/sessions"
        className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-dim"
      >
        <svg viewBox="0 0 8 12" className="h-3 w-2 rotate-180" aria-hidden>
          <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
        TRÆNINGSHISTORIK
      </Link>

      {session.isPending || !data ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          <header className="animate-rise">
            <div className="flex items-center gap-2">
              <span className="eyebrow capitalize text-volt">{weekdayShort(data.played_on)}</span>
              {data.status === "open" ? (
                <span className="rounded-[3px] bg-volt px-1.5 py-[1px] text-[9px] font-black tracking-[0.1em] text-volt-ink">
                  I GANG
                </span>
              ) : null}
              {data.type !== "training" ? (
                <span className="rounded-[3px] border border-line px-1.5 py-[1px] text-[9px] font-bold tracking-[0.1em] text-mute">
                  {sessionTypeLabel(data.type).toUpperCase()}
                </span>
              ) : null}
            </div>

            <div className="mt-1 flex items-center justify-between gap-3">
              <h1 className="min-w-0 truncate text-hero font-black tracking-[-0.045em]">
                {formatDateShort(data.played_on).replace(".", "")}
              </h1>
              {/* An evening is typed in from memory, so it is typed in wrong
                  sometimes. The way to fix it sits on the evening itself. */}
              <button
                onClick={() => {
                  haptic("tap");
                  gate.requireAuth(() => setEditing(true));
                }}
                className="shrink-0 rounded-pill border border-line px-3 py-1.5 text-[10px] font-bold tracking-[0.14em] text-mute transition-colors active:border-volt/50 active:text-volt"
              >
                RET
              </button>
            </div>

            <p className="num mt-1.5 text-mini text-mute">
              {data.season.name} · {matchCount(matches.length)} ·{" "}
              {squad.length} spillere
            </p>
            {data.note ? <p className="mt-1 text-[11px] italic text-dim">{data.note}</p> : null}
          </header>

          {data.status === "open" ? (
            <Button
              variant="volt"
              className="mt-4 w-full"
              onClick={() => {
                haptic("tap");
                gate.requireAuth(() => router.push(`/sessions/${data.id}/entry`));
              }}
            >
              Indtast kampe
            </Button>
          ) : null}

          <Recap recap={data.recap} standings={standings} />

          {matches.length > 0 ? (
            <section className="mt-6">
              <div className="flex items-center justify-between px-1 pb-2">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-[3px] rounded-full bg-volt" aria-hidden />
                  <h2 className="eyebrow text-mute">Kampene</h2>
                </div>
                <span className="num text-[10px] text-dim">Sæt vises som spillet</span>
              </div>
              <div className="space-y-1.5">
                {matches.map((match, index) => (
                  <MatchCard key={match.id} match={match} index={index} />
                ))}
              </div>
            </section>
          ) : (
            <p className="mt-8 rounded-card border border-dashed border-ink-600/70 px-4 py-8 text-center text-mini text-dim">
              Ingen kampe denne aften. Det var en af de andre slags.
            </p>
          )}

          <MovementBars standings={standings} />

          {/* Mounted only while open, so every opening starts from what is on
              screen rather than from whatever was typed and abandoned last. */}
          {editing ? (
            <SessionForm
              key={`edit-${data.id}`}
              open
              onOpenChange={setEditing}
              session={{
                id: data.id,
                played_on: data.played_on,
                type: data.type,
                note: data.note,
              }}
            />
          ) : null}

          <footer className="mt-8 flex items-center justify-between border-t border-line-soft px-1 pt-3">
            {/* The logo's own wordmark, dimmed to what --color-ink-500 reads
                as against the page: a signature, not a second header. */}
            <Wordmark height={9} className="opacity-20" />
            <span className="num text-[9px] tracking-[0.12em] text-ink-500">
              {formatDateShort(data.played_on).toUpperCase()}
            </span>
          </footer>
        </>
      )}
    </div>
  );
}
