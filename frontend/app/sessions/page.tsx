"use client";

import { SessionRow } from "@/components/session/session-row";
import { RowSkeletons } from "@/components/ui/skeleton";
import { useSessions } from "@/lib/queries";

export default function SessionsPage() {
  const sessions = useSessions();
  const groups = sessions.data?.groups ?? [];
  const total = groups.reduce((sum, group) => sum + group.sessions.length, 0);

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
          <section key={group.season.id} className="mt-6">
            <div className="sticky top-14 z-20 -mx-4 flex items-center justify-between gap-3 bg-ink-950/90 px-5 py-2 backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <span className="h-3 w-[3px] rounded-full bg-volt" aria-hidden />
                <h2 className="eyebrow text-mute">{group.season.name}</h2>
                {group.season.is_current ? (
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
