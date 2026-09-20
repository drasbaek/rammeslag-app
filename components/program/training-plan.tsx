"use client";

import { SectionHeader } from "@/components/ui/section";
import { nameParts } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EventMatchupOut, PlayerOut } from "@/lib/types";

/** Rounds in order, each with its courts in order. */
export function roundsOf(matchups: EventMatchupOut[]): { round: number; courts: EventMatchupOut[] }[] {
  const byRound = new Map<number, EventMatchupOut[]>();
  for (const matchup of matchups) {
    const courts = byRound.get(matchup.round) ?? [];
    courts.push(matchup);
    byRound.set(matchup.round, courts);
  }
  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, courts]) => ({ round, courts: [...courts].sort((a, b) => a.court - b.court) }));
}

/**
 * A name as the whiteboard writes it: the surname loud, the given name small
 * above it. Same treatment as the line-up picker on the entry screen, for the
 * same reason — two names have to sit side by side on a 390px phone.
 */
function Name({ player }: { player: PlayerOut }) {
  const { given, family } = nameParts(player.name);
  return (
    <span className="flex min-w-0 flex-col leading-none">
      {given ? (
        <span className="truncate text-[9px] font-semibold tracking-tight text-dim">{given}</span>
      ) : null}
      <span className={cn("truncate text-[13px] font-bold tracking-tight", given && "mt-[3px]")}>
        {family}
      </span>
    </span>
  );
}

function Court({ matchup }: { matchup: EventMatchupOut }) {
  return (
    <div className="rounded-row border border-line-soft bg-ink-900/70 px-2.5 py-2">
      <span className="block pb-1.5 text-[9px] font-bold tracking-[0.12em] text-dim">
        BANE {matchup.court}
      </span>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="min-w-0 space-y-1.5">
          {matchup.team_a.map((player) => (
            <Name key={player.id} player={player} />
          ))}
        </div>
        <span className="text-[9px] font-black tracking-[0.1em] text-volt">MOD</span>
        <div className="min-w-0 space-y-1.5 text-right">
          {matchup.team_b.map((player) => (
            <Name key={player.id} player={player} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The plan, as everybody reads it.
 *
 * A whiteboard and nothing else: there is no score here and there never will
 * be, because nothing on this screen becomes a kamp. Results are typed into
 * the aften, on the entry screen every other result goes through, and the
 * caption says so out loud so nobody waits for a box to fill in.
 */
export function TrainingPlan({ matchups }: { matchups: EventMatchupOut[] }) {
  const rounds = roundsOf(matchups);
  if (rounds.length === 0) return null;

  return (
    <div>
      <SectionHeader
        title="Planlagte kampe"
        right={
          <span className="num text-[13px] font-black text-mute">
            {rounds.length} {rounds.length === 1 ? "runde" : "runder"}
          </span>
        }
      />
      <div className="space-y-2">
        {rounds.map(({ round, courts }) => (
          <div key={round} className="rounded-card border border-line bg-ink-850/60 px-3 py-2.5">
            <span className="block pb-2 text-[10px] font-black tracking-[0.14em] text-mute">
              RUNDE {round}
            </span>
            <div className="space-y-1.5">
              {courts.map((matchup) => (
                <Court key={matchup.court} matchup={matchup} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 px-1 text-[10px] leading-snug text-dim">
        Planen er en tavle. Resultaterne skrives ind på aftenen som alle andre kampe.
      </p>
    </div>
  );
}
