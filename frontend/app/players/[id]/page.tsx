"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { FormDots } from "@/components/ui/form-dots";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/ui/section";
import { RatingCurve } from "@/components/player/rating-curve";
import { PairCard } from "@/components/player/pair-card";
import { StatColumns } from "@/components/player/stat-columns";
import { ProvisionalNote } from "@/components/ladder/provisional-mark";
import { SessionRow } from "@/components/session/session-row";
import { usePlayerProfile } from "@/lib/queries";
import { PROVISIONAL_MATCHES } from "@/lib/types";
import { rating as formatRating, delta, recordLine, formatDateShort } from "@/lib/format";

export default function PlayerProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const profile = usePlayerProfile(id);
  const data = profile.data;

  return (
    <div>
      <Link
        href="/"
        className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-dim"
      >
        <svg viewBox="0 0 8 12" className="h-3 w-2 rotate-180" aria-hidden>
          <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
        STIGEN
      </Link>

      {profile.isPending || !data ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <>
          <header className="animate-rise flex items-start gap-3">
            <Avatar name={data.player.name} size="lg" accent={!data.player.is_guest} />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {data.all_time.rank !== null ? (
                  <span className="num rounded-[4px] bg-ink-700 px-1.5 py-[2px] text-[10px] font-black tracking-[0.1em] text-mute">
                    NR. {data.all_time.rank}
                  </span>
                ) : null}
                {data.player.is_guest ? (
                  <span className="rounded-[3px] border border-ink-500 px-1.5 py-[2px] text-[9px] font-bold tracking-[0.1em] text-dim">
                    GÆST
                  </span>
                ) : null}
                {data.player.is_admin ? (
                  <span className="rounded-[3px] border border-volt/40 px-1.5 py-[2px] text-[9px] font-bold tracking-[0.1em] text-volt">
                    ADMIN
                  </span>
                ) : null}
              </div>

              <h1 className="mt-1 text-[26px] font-black leading-[1.02] tracking-[-0.035em]">
                {data.player.name}
              </h1>
            </div>

            <div className="shrink-0 text-right">
              <p className="num-tight text-hero font-black leading-none text-volt">
                {formatRating(data.all_time.rating)}
              </p>
              <p className="num mt-1 text-[10px] text-dim">
                start {formatRating(data.player.entry_rating)} · {delta(data.all_time.rating_gained, 0)}
              </p>
            </div>
          </header>

          <div className="mt-3 flex items-center gap-2.5 rounded-row bg-ink-850/60 px-3 py-2">
            <FormDots form={data.form} size="md" />
            <span className="num text-[11px] text-mute">
              {recordLine(data.all_time.wins, data.all_time.losses, data.all_time.draws)}
            </span>
            <span className="num ml-auto text-[10px] text-dim">
              {data.all_time.matches_played}{" "}
              {data.all_time.matches_played === 1 ? "kamp" : "kampe"} i alt
            </span>
          </div>

          {data.all_time.matches_played < PROVISIONAL_MATCHES ? (
            <p className="mt-3 rounded-row border border-volt/20 bg-volt/[0.05] px-3 py-2">
              <ProvisionalNote matchesPlayed={data.all_time.matches_played} />
            </p>
          ) : null}

          <section className="mt-5">
            <SectionHeader
              title="Ratingkurve"
              right={
                <span className="num text-[10px] text-dim">
                  {data.all_time.matches_played}{" "}
                  {data.all_time.matches_played === 1 ? "kamp" : "kampe"}
                </span>
              }
            />
            <RatingCurve
              curve={data.curve}
              entryRating={data.player.entry_rating}
              season={data.current_season}
            />
          </section>

          <section className="mt-5">
            <SectionHeader title="Tallene" />
            <StatColumns
              allTime={data.all_time}
              season={data.season}
              currentSeason={data.current_season}
            />
          </section>

          <section className="mt-5">
            <SectionHeader
              title="Kemi"
              right={<span className="text-[10px] text-dim">altid med antal kampe</span>}
            />
            <div className="grid grid-cols-2 gap-2">
              {data.best_partner ? <PairCard kind="partner" record={data.best_partner} /> : null}
              {data.nemesis ? <PairCard kind="nemesis" record={data.nemesis} /> : null}
              {data.favourite_opponent &&
              data.favourite_opponent.player.id !== data.nemesis?.player.id ? (
                <PairCard kind="prey" record={data.favourite_opponent} />
              ) : null}
              {/* With one evening behind you the best and the worst partner are
                  the same person. Printing the card twice would be four ways of
                  saying "we do not know yet". */}
              {data.worst_partner &&
              data.worst_partner.player.id !== data.best_partner?.player.id ? (
                <PairCard kind="burden" record={data.worst_partner} />
              ) : null}
            </div>
            {!data.best_partner && !data.nemesis ? (
              <p className="rounded-card border border-dashed border-ink-600/70 px-4 py-6 text-center text-mini text-dim">
                Der skal spilles flere kampe, før vi tør påstå noget om kemi.
              </p>
            ) : null}
          </section>

          {data.last_sessions.length > 0 ? (
            <section className="mt-5">
              <SectionHeader title="Seneste aftener" />
              <div className="space-y-1.5">
                {data.last_sessions.map((session, index) => (
                  <SessionRow key={session.id} session={session} index={index} />
                ))}
              </div>
            </section>
          ) : null}

          <footer className="mt-8 flex items-center justify-between border-t border-line-soft px-1 pt-3">
            <span className="text-[9px] font-bold tracking-[0.2em] text-ink-500">RAMMESLAG FC</span>
            <span className="num text-[9px] tracking-[0.12em] text-ink-500">
              {data.curve.length > 1
                ? formatDateShort(data.curve[data.curve.length - 1].played_at).toUpperCase()
                : ""}
            </span>
          </footer>
        </>
      )}

      {profile.isError ? (
        <p className="py-10 text-center text-mini text-loss">Kunne ikke hente spilleren.</p>
      ) : null}
    </div>
  );
}
