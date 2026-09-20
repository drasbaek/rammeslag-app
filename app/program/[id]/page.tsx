"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { EventForm } from "@/components/program/event-form";
import { MatchDetail } from "@/components/program/match-detail";
import { ResponseToggle } from "@/components/program/response-toggle";
import { TrainingDetail } from "@/components/program/training-detail";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvent, useMe } from "@/lib/queries";
import { clock, eventTypeLabel, formatDateLong, sentenceCase } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * One date, in full.
 *
 * Everything above the fold is the same for both kinds — when, where, and
 * your own answer — because that is the part every player opens the screen
 * for. Below it the two split: a fixture shows availability and the squad, a
 * training shows how full it is. The split is a component boundary, not a
 * pile of conditionals, so the two features can be worked on separately.
 */
export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const me = useMe();
  const event = useEvent(id);
  const [editing, setEditing] = useState(false);

  const data = event.data;
  const isAdmin = Boolean(me.data?.is_admin);
  const cancelled = data?.status === "cancelled";
  // Locked means the squad is picked. An admin can still move things; nobody
  // else changes their answer out from under a team sheet.
  const frozen = Boolean(cancelled || (data?.status === "locked" && !isAdmin));

  return (
    <div>
      <Link
        href="/program"
        className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-dim"
      >
        <svg viewBox="0 0 8 12" className="h-3 w-2 rotate-180" aria-hidden>
          <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
        PROGRAM
      </Link>

      {event.isPending || !data ? (
        <div className="space-y-3">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="eyebrow block">
                {eventTypeLabel(data.type)}
                {cancelled ? " · Aflyst" : ""}
              </span>
              <h1
                className={cn(
                  "mt-1.5 break-words text-[27px] font-black leading-[0.95] tracking-[-0.045em]",
                  cancelled && "text-dim line-through",
                )}
              >
                {data.opponent ?? eventTypeLabel(data.type)}
              </h1>
              <p className="mt-2 text-mini text-mute">
                {/* Not `capitalize`: Danish writes "lørdag 17. oktober", and
                    upper-casing every word would invent a German month. */}
                {sentenceCase(formatDateLong(data.held_on))}
                {` · ${clock(data.start_time)} · ${data.venue}`}
              </p>
              {data.note ? (
                <p className="mt-1 text-mini text-dim">{data.note}</p>
              ) : null}
            </div>

            {isAdmin ? (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  haptic("tap");
                  setEditing(true);
                }}
              >
                Ret
              </Button>
            ) : null}
          </div>

          <div className="mt-4">
            <span className="eyebrow block pb-1.5">
              {data.type === "training" ? "Kommer du?" : "Kan du spille?"}
            </span>
            <ResponseToggle
              eventId={data.id}
              type={data.type}
              value={data.my_state}
              disabled={frozen}
            />
            <p className="mt-1.5 text-[10px] leading-snug text-dim">
              {cancelled
                ? "Aflyst. Svarene bliver stående."
                : data.type === "training"
                  ? "Du kan skifte svar indtil træningen."
                  : "Et svar er en tilmelding. Holdet bliver sat bagefter."}
            </p>
          </div>

          <div className="mt-6">
            {data.type === "match" ? (
              <MatchDetail event={data} />
            ) : (
              <TrainingDetail event={data} />
            )}
          </div>

          {editing ? (
            <EventForm
              open
              onOpenChange={setEditing}
              type={data.type}
              event={data}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
