"use client";

import { useMemo } from "react";
import { SessionRow } from "@/components/session/session-row";
import { RowSkeletons } from "@/components/ui/skeleton";
import { useSeasons, useSessions } from "@/lib/queries";
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
      <div className="flex items-baseline justify-between px-1">
        <h1 className="text-hero font-black tracking-[-0.045em]">AFTENER</h1>
        <span className="num text-[10px] tracking-[0.14em] text-dim">{total > 0 ? `${total} I ALT` : ""}</span>
      </div>
      <p className="mt-1 px-1 text-mini text-mute">Hver aften er én række. Tryk for kampene og opsamlingen.</p>

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
                {group.sessions.length} aftener · {matches} kampe
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
        <p className="py-10 text-center text-mini text-loss">Kunne ikke hente aftenerne.</p>
      ) : null}
    </div>
  );
}
