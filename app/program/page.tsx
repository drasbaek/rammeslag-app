"use client";

import { useMemo, useState } from "react";
import { EventRow } from "@/components/program/event-row";
import { Segmented } from "@/components/ui/segmented";
import { RowSkeletons } from "@/components/ui/skeleton";
import { useEvents, useMe } from "@/lib/queries";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { EventScope, EventType } from "@/lib/types";

/**
 * What is coming up, and whether you have answered.
 *
 * Kampe and træninger share one list on purpose. They are two different
 * things to the people organising them and exactly one thing to the person
 * checking their phone on a Tuesday: a date they have to say yes or no to.
 * Splitting them into two tabs would mean answering the same question in two
 * places.
 *
 * The type filter below the scope toggle does not split them. It is a view
 * over the one list — same rows, same answering flow, fewer of them — for the
 * people who do think of the two as different things: an admin chasing six
 * klar for Saturday does not want eight Sundays in the way. It is a chip row
 * rather than a second Segmented so it reads as secondary to Kommende /
 * Tidligere, and it resets to Alle on every visit, because a filter that
 * survives a page you left is a filter that hides a kamp from you next week.
 */

/** "all" is not an `EventType`: it is the absence of the query parameter. */
type TypeFilter = "all" | EventType;

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "match", label: "Kampe" },
  { value: "training", label: "Træning" },
];

export default function ProgramPage() {
  const me = useMe();
  const [scope, setScope] = useState<EventScope>("upcoming");
  const [type, setType] = useState<TypeFilter>("all");
  const events = useEvents(scope, type === "all" ? undefined : type);

  const rows = useMemo(() => events.data ?? [], [events.data]);

  /**
   * How many events this player still owes an answer on. The filter narrows
   * the request, so this counts what is actually on screen — the header says
   * how much of the list you are looking at, never how much exists.
   */
  const owed = useMemo(
    () =>
      scope === "upcoming" && me.data
        ? rows.filter((e) => e.status !== "cancelled" && e.my_state === null).length
        : 0,
    [rows, scope, me.data],
  );

  const empty =
    scope === "upcoming"
      ? type === "match"
        ? {
            title: "Ingen kampe på vej",
            body: "Der står ingen kampe i kalenderen. Vælg Alle for også at se træninger.",
          }
        : type === "training"
          ? {
              title: "Ingen træninger på vej",
              body: "Der står ingen træninger i kalenderen. Vælg Alle for også at se kampe.",
            }
          : {
              title: "Ikke noget i kalenderen",
              body: "Når en kamp eller en træning er sat op, kan alle melde til og fra herinde.",
            }
      : type === "match"
        ? {
            title: "Ingen tidligere kampe",
            body: "Overståede kampe samler sig her. Vælg Alle for også at se træninger.",
          }
        : type === "training"
          ? {
              title: "Ingen tidligere træninger",
              body: "Overståede træninger samler sig her. Vælg Alle for også at se kampe.",
            }
          : {
              title: "Ingen tidligere datoer",
              body: "Kampe og træninger, der er overstået, samler sig her.",
            };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h1 className="text-hero font-black leading-none tracking-[-0.045em]">PROGRAM</h1>
        <span className="num shrink-0 text-[10px] tracking-[0.14em] text-dim">
          {rows.length > 0 ? `${rows.length} I ALT` : ""}
        </span>
      </div>
      <p className="mt-1.5 px-1 text-mini text-mute">
        {owed > 0
          ? `Du mangler at svare på ${owed} ${owed === 1 ? "dato" : "datoer"}.`
          : "Kampe og søndagstræninger. Meld til og fra."}
      </p>

      <div className="mt-4">
        <Segmented
          options={[
            { value: "upcoming", label: "Kommende" },
            { value: "past", label: "Tidligere" },
          ]}
          value={scope}
          onChange={setScope}
        />
      </div>

      {/* Chips, not a second sliding pill: this is a narrowing of the list
          above it, and it costs one row of height instead of three. */}
      <div role="group" aria-label="Filtrer efter type" className="mt-2 flex gap-1.5 px-1">
        {TYPE_FILTERS.map((option) => {
          const active = option.value === type;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (!active) haptic("tap");
                setType(option.value);
              }}
              className={cn(
                "rounded-pill border px-3 py-1 text-[11px] font-semibold tracking-wide transition-colors",
                active
                  ? "border-volt/50 bg-volt/10 text-chalk"
                  : "border-line bg-ink-900 text-dim active:text-chalk",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {events.isPending ? (
        <div className="mt-4">
          <RowSkeletons count={4} />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-card border border-line bg-ink-850/60 px-4 py-8 text-center">
          <p className="text-body font-bold tracking-tight">{empty.title}</p>
          <p className="mx-auto mt-1.5 max-w-[34ch] text-mini text-mute">{empty.body}</p>
        </div>
      ) : (
        <div className="mt-4 space-y-1.5">
          {rows.map((event, index) => (
            <EventRow key={event.id} event={event} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}
