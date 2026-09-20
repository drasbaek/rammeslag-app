"use client";

import { useMemo, useState } from "react";
import { EventRow } from "@/components/program/event-row";
import { EventForm } from "@/components/program/event-form";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { RowSkeletons } from "@/components/ui/skeleton";
import { useEvents, useMe } from "@/lib/queries";
import { haptic } from "@/lib/haptics";
import type { EventScope, EventType } from "@/lib/types";

/**
 * What is coming up, and whether you have answered.
 *
 * Kampe and træninger share one list on purpose. They are two different
 * things to the people organising them and exactly one thing to the person
 * checking their phone on a Tuesday: a date they have to say yes or no to.
 * Splitting them into two tabs would mean answering the same question in two
 * places.
 */
export default function ProgramPage() {
  const me = useMe();
  const [scope, setScope] = useState<EventScope>("upcoming");
  const [creating, setCreating] = useState<EventType | null>(null);
  const events = useEvents(scope);

  const isAdmin = Boolean(me.data?.is_admin);
  const rows = useMemo(() => events.data ?? [], [events.data]);

  /** How many upcoming events this player still owes an answer on. */
  const owed = useMemo(
    () =>
      scope === "upcoming" && me.data
        ? rows.filter((e) => e.status !== "cancelled" && e.my_state === null).length
        : 0,
    [rows, scope, me.data],
  );

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

      {isAdmin ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            variant="solid"
            onClick={() => {
              haptic("tap");
              setCreating("match");
            }}
          >
            Ny kamp
          </Button>
          <Button
            variant="solid"
            onClick={() => {
              haptic("tap");
              setCreating("training");
            }}
          >
            Ny træning
          </Button>
        </div>
      ) : null}

      {events.isPending ? (
        <div className="mt-4">
          <RowSkeletons count={4} />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-card border border-line bg-ink-850/60 px-4 py-8 text-center">
          <p className="text-body font-bold tracking-tight">
            {scope === "upcoming" ? "Ikke noget i kalenderen" : "Ingen tidligere datoer"}
          </p>
          <p className="mx-auto mt-1.5 max-w-[34ch] text-mini text-mute">
            {scope === "upcoming"
              ? "Når en kamp eller en træning er sat op, kan alle melde til og fra herinde."
              : "Kampe og træninger, der er overstået, samler sig her."}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-1.5">
          {rows.map((event, index) => (
            <EventRow key={event.id} event={event} index={index} />
          ))}
        </div>
      )}

      {creating ? (
        <EventForm
          open
          onOpenChange={(open) => !open && setCreating(null)}
          type={creating}
        />
      ) : null}
    </div>
  );
}
