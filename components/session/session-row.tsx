import Link from "next/link";
import type { SessionOut } from "@/lib/types";
import { dayNumber, monthShort, weekdayShort, sessionTypeLabel } from "@/lib/format";

/**
 * One evening. Not a match — the list is of nights out.
 *
 * `GET /api/sessions` answers with a date, a type, a status and a match count;
 * it does not list who turned up. So the row leads with the date block and
 * closes on the match count instead of a stack of faces: the number is the
 * honest headline, and it is the one the endpoint actually returns.
 */
export function SessionRow({ session, index }: { session: SessionOut; index: number }) {
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
          <span className="truncate text-body font-bold capitalize tracking-tight">
            {weekdayShort(session.played_on)}
          </span>
          {open ? (
            <span className="shrink-0 rounded-[3px] bg-volt px-1.5 py-[1px] text-[9px] font-black tracking-[0.1em] text-volt-ink">
              I GANG
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-[11px] text-dim">
          <span className="text-mute">{sessionTypeLabel(session.type)}</span>
          {session.note ? ` · ${session.note}` : ""}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end">
        <span className="num-tight text-[19px] font-black leading-none">{session.match_count}</span>
        <span className="mt-0.5 text-[9px] font-bold tracking-[0.1em] text-dim">
          {session.match_count === 1 ? "KAMP" : "KAMPE"}
        </span>
      </div>

      <svg viewBox="0 0 8 12" className="h-3 w-2 shrink-0 text-ink-500" aria-hidden>
        <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
    </Link>
  );
}
