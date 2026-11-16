import type { SetOut } from "@/lib/types";

/**
 * A scoreline, set by set, the way it is said out loud. The game total is
 * what the rating adds up; it is not a result anybody says. A match-tie sits
 * in brackets, because its numbers are points and must not read as games.
 * Never shrinks: the names beside it give way first.
 */
export function SetScores({ sets }: { sets: SetOut[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {sets.map((set, index) => (
        <span key={index} className="num-tight text-[13px] font-bold tabular-nums text-chalk">
          {set.tiebreak ? <span className="text-dim">[</span> : null}
          {set.games_a}
          <span className="text-dim">-</span>
          {set.games_b}
          {set.tiebreak ? <span className="text-dim">]</span> : null}
        </span>
      ))}
    </span>
  );
}
