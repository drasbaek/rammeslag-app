"use client";

import { useMemo } from "react";
import { SessionRow } from "@/components/session/session-row";
import { useQuickAdd } from "@/components/quick-add";
import { Button } from "@/components/ui/button";
import { RowSkeletons } from "@/components/ui/skeleton";
import { useSeasons, useSessions } from "@/lib/queries";
import { haptic } from "@/lib/haptics";
import type { SessionOut } from "@/lib/types";

interface Group {
  id: string;
  name: string;
  isCurrent: boolean;
  sessions: SessionOut[];
}

export default function SessionsPage() {
  const sessions = useSessions();
  const seasons = useSeasons();
  const quickAdd = useQuickAdd();

  /**
   * `GET /api/sessions` is one flat list, newest first — the season only comes
   * along as a ref on each row. The headings are a view, so they are folded
   * here rather than asked for.
   */
  const groups = useMemo<Group[]>(() => {
    const currentId = seasons.data?.find((season) => season.is_current)?.id ?? null;
    const byId = new Map<string, Group>();
    for (const session of sessions.data ?? []) {
      const group = byId.get(session.season.id) ?? {
        id: session.season.id,
        name: session.season.name,
        isCurrent: session.season.id === currentId,
        sessions: [],
      };
      group.sessions.push(session);
      byId.set(group.id, group);
    }
    return [...byId.values()];
  }, [sessions.data, seasons.data]);

  const total = sessions.data?.length ?? 0;

  return (
    <div>
      {/* Sixteen characters at hero size run off a 390px screen, so this one
          title is set smaller. It is still the loudest thing on the page. */}
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h1 className="text-[27px] font-black leading-none tracking-[-0.045em]">
          TRÆNINGSHISTORIK
        </h1>
        <span className="num shrink-0 text-[10px] tracking-[0.14em] text-dim">
          {total > 0 ? `${total} I ALT` : ""}
        </span>
      </div>
      <p className="mt-1.5 px-1 text-mini text-mute">
        Hver træning er én række. Tryk for kampene og opsamlingen.
      </p>

      {/* The way in. Without it the entry screen has no reachable door for an
          evening that is not already on the list. */}
      <Button
        variant="volt"
        size="lg"
        className="mt-4 w-full"
        onClick={() => {
          haptic("tap");
          quickAdd.openSession();
        }}
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
          <path d="M10 3.5v13M3.5 10h13" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        Ny træningssession
      </Button>

      {!sessions.isPending && total === 0 ? (
        <p className="mt-6 rounded-card border border-dashed border-ink-600/70 px-4 py-8 text-center text-mini text-dim">
          Ingen træninger endnu. Opret aftenen, og skriv kampene ind.
        </p>
      ) : null}

      {sessions.isPending ? (
        <div className="mt-5">
          <RowSkeletons count={7} />
        </div>
      ) : null}

      {groups.map((group) => {
        const matches = group.sessions.reduce((sum, session) => sum + session.match_count, 0);
        return (
          <section key={group.id} className="mt-6">
            <div className="sticky top-14 z-20 -mx-4 flex items-center justify-between gap-3 bg-ink-950/90 px-5 py-2 backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <span className="h-3 w-[3px] rounded-full bg-volt" aria-hidden />
                <h2 className="eyebrow text-mute">{group.name}</h2>
                {group.isCurrent ? (
                  <span className="rounded-[3px] border border-volt/40 px-1 py-[1px] text-[9px] font-bold tracking-[0.1em] text-volt">
                    NU
                  </span>
                ) : null}
              </div>
              <span className="num text-[10px] text-dim">
                {group.sessions.length} træninger · {matches} kampe
              </span>
            </div>

            <div className="mt-2 space-y-1.5">
              {group.sessions.map((session, index) => (
                <SessionRow key={session.id} session={session} index={index} />
              ))}
            </div>
          </section>
        );
      })}

      {sessions.isError ? (
        <p className="py-10 text-center text-mini text-loss">Kunne ikke hente sessionerne.</p>
      ) : null}
    </div>
  );
}
