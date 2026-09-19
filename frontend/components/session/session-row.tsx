import Link from "next/link";
import type { SessionSummary } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { dayNumber, monthShort, weekdayShort, SESSION_TYPE_LABEL } from "@/lib/format";

/** One evening. Not a match — the list is of nights out. */
export function SessionRow({ session, index }: { session: SessionSummary; index: number }) {
  const shown = session.players.slice(0, 4);
  const rest = session.players.length - shown.length;
  const open = session.status === "open";

  return (
    <Link
      href={`/sessions/${session.id}`}
      style={{ animationDelay: `${Math.min(index, 10) * 24}ms` }}
      className="animate-rise flex items-center gap-3 rounded-row border border-transparent bg-ink-850/70 px-3 py-2.5 transition-colors active:border-line active:bg-ink-800"
    >
      <div className="flex w-11 shrink-0 flex-col items-center rounded-[10px] border border-line bg-ink-900 py-1.5">
        <span className="num-tight text-[19px] font-black leading-none">{dayNumber(session.played_on)}</span>
        <span className="mt-0.5 text-[9px] font-bold tracking-[0.1em] text-dim">
          {monthShort(session.played_on)}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-body font-bold tracking-tight">
            <span className="capitalize">{weekdayShort(session.played_on)}</span>
            <span className="text-dim"> · </span>
            <span className="font-semibold text-mute">
              {session.match_count} {session.match_count === 1 ? "kamp" : "kampe"}
            </span>
          </span>
          {open ? (
            <span className="shrink-0 rounded-[3px] bg-volt px-1.5 py-[1px] text-[9px] font-black tracking-[0.1em] text-volt-ink">
              I GANG
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-[11px] text-dim">
          {session.type === "training" ? null : (
            <span className="text-mute">{SESSION_TYPE_LABEL[session.type]} · </span>
          )}
          {session.note ?? `${session.players.length} spillere`}
        </p>
      </div>

      <div className="flex shrink-0 items-center">
        <div className="flex -space-x-2">
          {shown.map((player) => (
            <Avatar key={player.id} name={player.name} size="xs" className="ring-2 ring-ink-950" />
          ))}
        </div>
        {rest > 0 ? <span className="num ml-1.5 text-[10px] text-dim">+{rest}</span> : null}
      </div>
    </Link>
  );
}
