import type { MatchOut } from "@/lib/types";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One side of one match: both players, whole names, one above the other.
 *
 * Two full names on a single line is 40 characters, and 40 characters do not
 * fit next to a scoreline on a 390px screen — one of them would always end in
 * an ellipsis. Stacked, the longest name in the club has room to spare.
 */
function TeamLine({
  names,
  games,
  won,
  setResults,
  tiebreaks,
}: {
  names: string[];
  games: number[];
  won: boolean;
  setResults: (boolean | null)[];
  /** Which columns are a match-tie: points, not games, so drawn differently. */
  tiebreaks: boolean[];
}) {
  return (
    <div className="flex items-center gap-2 py-[3px]">
      <span
        className={cn(
          "w-[3px] shrink-0 self-stretch rounded-full",
          won ? "bg-volt" : "bg-transparent",
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        {names.map((name) => (
          <span
            key={name}
            className={cn(
              "block truncate text-[13px] leading-[1.35] tracking-tight",
              won ? "font-bold text-chalk" : "font-medium text-mute",
            )}
          >
            {name}
          </span>
        ))}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {games.map((value, i) => (
          <span
            key={i}
            className={cn(
              "num-tight flex h-6 w-6 items-center justify-center rounded-[5px] text-[13px] font-bold",
              tiebreaks[i] ? "w-7 border border-dashed border-line" : "",
              setResults[i] === true
                ? "bg-volt/15 text-volt"
                : setResults[i] === false
                  ? "text-dim"
                  : "text-mute",
            )}
          >
            {value}
          </span>
        ))}
      </span>
    </div>
  );
}

export function MatchCard({
  match,
  index,
  onEdit,
}: {
  match: MatchOut;
  index: number;
  /** Given when this viewer may correct the score. Absent = read-only. */
  onEdit?: () => void;
}) {
  const gamesA = match.sets.map((set) => set.games_a);
  const gamesB = match.sets.map((set) => set.games_b);
  // The set verdict is display only and comes down the wire already decided:
  // two clear games or 7-6 (two clear points in a match-tie), "D" for the
  // timed sets that end level.
  const verdicts = match.sets.map((set) => set.winner);
  const tiebreaks = match.sets.map((set) => set.tiebreak);
  const hasTiebreak = tiebreaks.some(Boolean);

  return (
    <article
      style={{ animationDelay: `${Math.min(index, 8) * 28}ms` }}
      className="animate-rise rounded-row border border-line-soft bg-ink-850/80 px-2.5 py-2"
    >
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="num text-[9px] font-bold tracking-[0.16em] text-dim">
          KAMP {index + 1}
          {/* The dashed column is a match-tie, in points. Said once, here,
              rather than left for somebody to read as a 10-8 set. */}
          {hasTiebreak ? <span className="text-ink-500"> · MATCH-TIE</span> : null}
        </span>
        <span className="flex items-center gap-2">
          <span className="num text-[9px] tracking-[0.1em] text-ink-500">{formatTime(match.played_at)}</span>
          {onEdit ? (
            <button
              onClick={onEdit}
              aria-label={`Ret resultatet i kamp ${index + 1}`}
              className="-my-1 rounded-pill border border-line px-2 py-1 text-[9px] font-bold tracking-[0.14em] text-mute transition-colors active:border-volt/50 active:text-volt"
            >
              RET
            </button>
          ) : null}
        </span>
      </div>
      <TeamLine
        names={match.team_a.map((player) => player.name)}
        games={gamesA}
        won={match.winner === "A"}
        setResults={verdicts.map((v) => (v === "D" ? null : v === "A"))}
        tiebreaks={tiebreaks}
      />
      <TeamLine
        names={match.team_b.map((player) => player.name)}
        games={gamesB}
        won={match.winner === "B"}
        setResults={verdicts.map((v) => (v === "D" ? null : v === "B"))}
        tiebreaks={tiebreaks}
      />
    </article>
  );
}
