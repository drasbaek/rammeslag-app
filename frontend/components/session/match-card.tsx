import type { MatchOut } from "@/lib/types";
import { firstName, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function TeamLine({
  names,
  games,
  won,
  setResults,
}: {
  names: string;
  games: number[];
  won: boolean;
  setResults: (boolean | null)[];
}) {
  return (
    <div className="flex items-center gap-2 py-[3px]">
      <span
        className={cn(
          "h-4 w-[3px] shrink-0 rounded-full",
          won ? "bg-volt" : "bg-transparent",
        )}
        aria-hidden
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[13px] tracking-tight",
          won ? "font-bold text-chalk" : "font-medium text-mute",
        )}
      >
        {names}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {games.map((value, i) => (
          <span
            key={i}
            className={cn(
              "num-tight flex h-6 w-6 items-center justify-center rounded-[5px] text-[13px] font-bold",
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

export function MatchCard({ match, index }: { match: MatchOut; index: number }) {
  const gamesA = match.sets.map((set) => set.games_a);
  const gamesB = match.sets.map((set) => set.games_b);
  // The set verdict is display only and comes down the wire already decided:
  // two clear games or 7-6, "D" for the timed sets that end level.
  const verdicts = match.sets.map((set) => set.winner);

  return (
    <article
      style={{ animationDelay: `${Math.min(index, 8) * 28}ms` }}
      className="animate-rise rounded-row border border-line-soft bg-ink-850/80 px-2.5 py-2"
    >
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="num text-[9px] font-bold tracking-[0.16em] text-dim">
          KAMP {index + 1}
        </span>
        <span className="num text-[9px] tracking-[0.1em] text-ink-500">{formatTime(match.played_at)}</span>
      </div>
      <TeamLine
        names={`${firstName(match.team_a[0].name)} & ${firstName(match.team_a[1].name)}`}
        games={gamesA}
        won={match.winner === "A"}
        setResults={verdicts.map((v) => (v === "D" ? null : v === "A"))}
      />
      <TeamLine
        names={`${firstName(match.team_b[0].name)} & ${firstName(match.team_b[1].name)}`}
        games={gamesB}
        won={match.winner === "B"}
        setResults={verdicts.map((v) => (v === "D" ? null : v === "B"))}
      />
    </article>
  );
}
