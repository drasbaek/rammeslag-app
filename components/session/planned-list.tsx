"use client";

import { SectionHeader } from "@/components/ui/section";
import { firstName } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { MatchOut, PlannedGameOut } from "@/lib/types";

/**
 * The kampe a træning was planned with, and which of them have a score.
 *
 * This is the evening's to-do list. The plan is set once, before anybody
 * plays; the results arrive afterwards, in whatever order, from whichever
 * phone is nearest. So a row is one of two things: a scoreline, or a job.
 *
 * Nothing here is a match. The API pairs a planned court with a result by the
 * two pairs of names, on read — a plan never becomes a kamp on its own, and
 * tapping a row only fills the four names into the picker below. The score is
 * still typed in and saved like every other kamp in this app.
 */
export function PlannedList({
  planned,
  matches,
  onPick,
  selected,
}: {
  planned: PlannedGameOut[];
  matches: MatchOut[];
  /** Given on the entry screen: tapping a row picks those four. Absent = read-only. */
  onPick?: (game: PlannedGameOut) => void;
  /** The four currently in the picker, so the row being typed in is marked. */
  selected?: string[];
}) {
  if (planned.length === 0) return null;

  const byId = new Map(matches.map((match) => [match.id, match]));
  const done = planned.filter((game) => game.match_id !== null).length;
  const missing = planned.length - done;

  return (
    <section>
      <SectionHeader
        title="Aftenens kampe"
        right={
          <span className="num text-[13px] font-black text-mute">
            {done}
            <span className="text-dim">/{planned.length}</span>
          </span>
        }
      />
      <div className="space-y-1.5">
        {planned.map((game) => {
          const match = game.match_id ? byId.get(game.match_id) : undefined;
          const four = [...game.team_a, ...game.team_b].map((player) => player.id);
          // The row whose names are in the picker right now. Marked so it is
          // obvious which kamp the score pad below belongs to.
          const active =
            !match &&
            selected?.length === 4 &&
            four.every((id) => selected.includes(id));

          const body = (
            <>
              <span className="num w-[46px] shrink-0 text-[9px] font-bold tracking-[0.08em] text-dim">
                R{game.round} · B{game.court}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-mute">
                {firstName(game.team_a[0]?.name ?? "")} &amp;{" "}
                {firstName(game.team_a[1]?.name ?? "")}
                <span className="text-dim"> mod </span>
                {firstName(game.team_b[0]?.name ?? "")} &amp;{" "}
                {firstName(game.team_b[1]?.name ?? "")}
              </span>
              {match ? (
                /* Set by set, the way it is said out loud. The game total is
                   what the rating adds up; it is not a result anybody says. */
                <span className="flex shrink-0 items-center gap-1">
                  {match.sets.map((set, index) => (
                    <span
                      key={index}
                      className="num-tight text-[13px] font-bold tabular-nums text-chalk"
                    >
                      {set.games_a}
                      <span className="text-dim">-</span>
                      {set.games_b}
                    </span>
                  ))}
                </span>
              ) : (
                <span
                  className={cn(
                    "shrink-0 text-[10px] font-bold tracking-[0.1em]",
                    active ? "text-volt" : onPick ? "text-volt" : "text-dim",
                  )}
                >
                  {active ? "I GANG" : onPick ? "INDTAST →" : "MANGLER"}
                </span>
              )}
            </>
          );

          const shell =
            "flex w-full items-center gap-2 rounded-row border px-3 py-2.5 text-left transition-colors";

          return onPick && !match ? (
            <button
              key={`${game.round}:${game.court}`}
              onClick={() => {
                haptic("tap");
                onPick(game);
              }}
              className={cn(
                shell,
                active
                  ? "border-volt/50 bg-volt/[0.08]"
                  : "border-line bg-ink-850/70 active:border-volt/40",
              )}
            >
              {body}
            </button>
          ) : (
            <div
              key={`${game.round}:${game.court}`}
              className={cn(
                shell,
                match ? "border-transparent bg-ink-850/70" : "border-dashed border-line bg-transparent",
              )}
            >
              {body}
            </div>
          );
        })}
      </div>
      <p className="mt-2 px-1 text-[10px] leading-snug text-dim">
        {missing === 0
          ? "Alle kampe er skrevet ind. Aftenen kan lukkes."
          : `Mangler ${missing} ${missing === 1 ? "resultat" : "resultater"}. Alle kan skrive deres egne ind.`}
      </p>
    </section>
  );
}
