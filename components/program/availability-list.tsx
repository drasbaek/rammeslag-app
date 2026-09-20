import { Avatar } from "@/components/ui/avatar";
import { SectionHeader } from "@/components/ui/section";
import { firstName, responseLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  EventDetailOut,
  EventResponseOut,
  EventType,
  PlayerOut,
  ResponseState,
} from "@/lib/types";

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

/**
 * Per-player control. `state` is the answer on record, or `null` for someone
 * in "Mangler svar" — a caller can tell silence from an answer without the
 * list having to invent one.
 */
export type AvailabilityAction = (
  player: PlayerOut,
  state: ResponseState | null,
) => React.ReactNode;

/**
 * Who wrote this row, when it was not the person it is about.
 *
 * A guest's row always carries somebody else's id — the member who brought
 * them — and the G badge already says that, so a guest gets one marker, not
 * two saying the same thing.
 */
function writtenBy(
  row: EventResponseOut,
  names: Map<string, string>,
): { short: string; full: string } | null {
  if (row.player.is_guest) return null;
  if (!row.added_by || row.added_by === row.player.id) return null;
  const name = names.get(row.added_by);
  if (!name) return { short: "sat af en anden", full: "Svaret er sat af en anden" };
  return { short: `sat af ${firstName(name)}`, full: `Svaret er sat af ${name}` };
}

/** Every name the detail already knows, so resolving an id costs no request. */
function nameById(event: EventDetailOut): Map<string, string> {
  const names = new Map<string, string>();
  const add = (player: PlayerOut) => names.set(player.id, player.name);
  event.responses.forEach((row) => add(row.player));
  event.unanswered.forEach(add);
  event.selected.forEach(add);
  event.matchups.forEach((matchup) => {
    matchup.team_a.forEach(add);
    matchup.team_b.forEach(add);
  });
  return names;
}

function Person({
  player,
  note,
  trailing,
  dimmed = false,
}: {
  player: PlayerOut;
  /** Quiet second line under the name: who answered on their behalf. */
  note?: { short: string; full: string } | null;
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
      {/* Quiet, and allowed to wrap rather than push the row wide: nobody
          should find themselves marked "Klar" without knowing who did it. */}
      {note ? (
        <span
          className="max-w-[92px] shrink-0 break-words text-right text-[10px] leading-tight text-dim"
          title={note.full}
        >
          {note.short}
        </span>
      ) : null}
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
  /**
   * Per-player control, for the screens that offer one (removing a guest, or
   * an admin answering on somebody's behalf). It is offered on all four
   * groups, "Mangler svar" included — those are the names being chased.
   */
  action?: AvailabilityAction;
}) {
  const names = nameById(event);
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
                note={writtenBy(row, names)}
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
              <Person
                key={player.id}
                player={player}
                dimmed
                trailing={action?.(player, null)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
