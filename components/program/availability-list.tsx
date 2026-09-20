import { Avatar } from "@/components/ui/avatar";
import { SectionHeader } from "@/components/ui/section";
import { responseLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EventDetailOut, EventType, PlayerOut, ResponseState } from "@/lib/types";

const ORDER: ResponseState[] = ["yes", "maybe", "no"];

const TONE: Record<ResponseState, string> = {
  yes: "text-win",
  maybe: "text-draw",
  no: "text-loss",
};

const DOT: Record<ResponseState, string> = {
  yes: "bg-win",
  maybe: "bg-draw",
  no: "bg-loss",
};

function Person({
  player,
  trailing,
  dimmed = false,
}: {
  player: PlayerOut;
  trailing?: React.ReactNode;
  dimmed?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-row border border-line-soft bg-ink-850/60 px-2.5 py-2",
        dimmed && "opacity-60",
      )}
    >
      <Avatar name={player.name} size="sm" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight">
        {player.name}
      </span>
      {/* One letter, same as the ladder: at 390px the word costs four
          characters of somebody's actual name. */}
      {player.is_guest ? (
        <span
          className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border border-ink-500 text-[9px] font-black text-dim"
          title="Gæst"
          aria-label="Gæst"
        >
          G
        </span>
      ) : null}
      {trailing}
    </div>
  );
}

/**
 * Everybody's answer, grouped the way the old spreadsheet's column read: the
 * yeses first, then the shrugs, then the noes, then the people who have not
 * said anything.
 *
 * Every group carries its own count, so the screen never claims more than it
 * knows. "Mangler svar" is its own group rather than a fourth colour, because
 * silence is not an answer and the point of showing it is that somebody has
 * to go and ask them.
 */
export function AvailabilityList({
  event,
  type,
  action,
}: {
  event: EventDetailOut;
  type: EventType;
  /** Per-player control, for the screens that offer one (removing a guest). */
  action?: (player: PlayerOut, state: ResponseState) => React.ReactNode;
}) {
  const groups = ORDER.map((state) => ({
    state,
    people: event.responses.filter((r) => r.state === state),
  })).filter((group) => group.people.length > 0);

  return (
    <div className="space-y-4">
      {groups.map(({ state, people }) => (
        <div key={state}>
          <SectionHeader
            title={responseLabel(state, type)}
            right={
              <span className={cn("num text-[13px] font-black", TONE[state])}>
                {people.length}
              </span>
            }
          />
          <div className="space-y-1.5">
            {people.map((row) => (
              <Person
                key={row.player.id}
                player={row.player}
                trailing={
                  <span className="flex items-center gap-2">
                    {action?.(row.player, row.state)}
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[state])} aria-hidden />
                  </span>
                }
              />
            ))}
          </div>
        </div>
      ))}

      {event.unanswered.length > 0 ? (
        <div>
          <SectionHeader
            title="Mangler svar"
            right={
              <span className="num text-[13px] font-black text-dim">
                {event.unanswered.length}
              </span>
            }
          />
          <div className="space-y-1.5">
            {event.unanswered.map((player) => (
              <Person key={player.id} player={player} dimmed />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
