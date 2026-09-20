"use client";

import Link from "next/link";
import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useCreateEvent, useSeasons, useUpdateEvent } from "@/lib/queries";
import { seasonFor, seasonRange, todayISO } from "@/lib/seasons";
import { clockInput, courtCount } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { EventDetailOut, EventType } from "@/lib/types";

const FIELD =
  "w-full rounded-row border border-line bg-ink-900 px-3 py-2.5 text-body text-chalk placeholder:text-dim focus:border-volt/60 focus:outline-none";

/** Three courts is the standing booking; two is the Sunday we got squeezed. */
const COURT_CHOICES = [1, 2, 3, 4];

/**
 * Put something in the calendar, or correct it.
 *
 * One form for both kinds, because most of it is the same question — when,
 * and a note. A fixture then asks where, who we are playing and how many the
 * squad is; a training asks how many baner are booked and turns that into
 * places on its own. Training is always at Pakhus77, so nobody is asked: the
 * backend fills the venue in, and the row and the detail screen still show it.
 *
 * The season is never chosen. The backend resolves it from the date and
 * refuses a date no season covers, so the form shows which season the date
 * lands in and says so out loud when it lands in none — the same failure, and
 * the same way out of it, as the session form.
 */
export function EventForm({
  open,
  onOpenChange,
  type,
  event = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: EventType;
  /** The event being corrected, or null to create one. */
  event?: EventDetailOut | null;
}) {
  const create = useCreateEvent();
  const update = useUpdateEvent(event?.id ?? "");
  const seasons = useSeasons();

  const [heldOn, setHeldOn] = useState(event?.held_on ?? todayISO());
  const [startTime, setStartTime] = useState(
    event ? clockInput(event.start_time) : type === "training" ? "10:00" : "18:00",
  );
  // Fixtures only. A training's venue is the backend's default and is never
  // sent from here, so an edit leaves whatever is stored alone.
  const [venue, setVenue] = useState(event?.venue ?? "");
  const [opponent, setOpponent] = useState(event?.opponent ?? "");
  const [capacity, setCapacity] = useState(event?.capacity ?? (type === "match" ? 6 : 12));
  const [note, setNote] = useState(event?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  const season = heldOn ? seasonFor(seasons.data ?? [], heldOn) : null;
  // Only trustworthy once the seasons are here; until then the form says
  // nothing rather than accusing a perfectly good date.
  const uncovered = Boolean(heldOn) && !seasons.isPending && !season;
  const pending = create.isPending || update.isPending;
  const isMatch = type === "match";

  const fail = (cause: Error) => {
    haptic("warn");
    setError(cause.message);
  };

  const submit = () => {
    if (!heldOn) {
      setError("Vælg en dato.");
      haptic("warn");
      return;
    }
    if (isMatch && !venue.trim()) {
      setError("Skriv hvor det foregår.");
      haptic("warn");
      return;
    }
    const done = () => {
      haptic("success");
      onOpenChange(false);
    };

    if (event) {
      update
        .mutateAsync({
          held_on: heldOn,
          start_time: startTime,
          // Omitted, not blanked: the API reads an empty string as an error
          // and an absent field as "leave it".
          venue: isMatch ? venue.trim() : undefined,
          opponent: isMatch ? opponent.trim() : undefined,
          capacity,
          note: note.trim(),
        })
        .then(done)
        .catch(fail);
      return;
    }

    create
      .mutateAsync({
        type,
        held_on: heldOn,
        start_time: startTime,
        venue: isMatch ? venue.trim() : undefined,
        opponent: isMatch ? opponent.trim() || null : null,
        capacity,
        note: note.trim() || null,
      })
      .then(done)
      .catch(fail);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        event
          ? isMatch
            ? "Ret kampen"
            : "Ret træningen"
          : isMatch
            ? "Ny kamp"
            : "Ny træning"
      }
      description={
        isMatch
          ? "Holdet melder sig klar herefter. Udtagelsen laver du bagefter."
          : // A new training goes in the home hall, so the form can say so.
            // An existing one names where it actually is: the API still takes
            // a venue, so a Sunday somewhere else is a thing that can exist,
            // and a sheet asserting "altid i Pakhus77" over it would be wrong.
            event
            ? `I ${event.venue}. Baner kan ændres, hvis hallen laver om.`
            : "Altid i Pakhus77. Baner kan ændres, hvis hallen laver om."
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="eyebrow block pb-1.5">Dato</span>
            <input
              type="date"
              className={cn(FIELD, "num")}
              value={heldOn}
              onChange={(e) => {
                setHeldOn(e.target.value);
                setError(null);
              }}
            />
          </label>
          <label className="block">
            <span className="eyebrow block pb-1.5">Klokkeslæt</span>
            <input
              type="time"
              className={cn(FIELD, "num")}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </label>
        </div>

        {seasons.isPending || !heldOn || !season ? null : (
          <span className="block px-1 text-[10px] leading-snug text-dim">
            Lander i <span className="font-semibold text-mute">{season.name}</span> ·{" "}
            <span className="num">{seasonRange(season)}</span>
          </span>
        )}

        {uncovered ? (
          <div className="rounded-card border border-volt/30 bg-volt/[0.06] px-3 py-3">
            <p className="text-[13px] font-bold text-chalk">Ingen sæson dækker den dato.</p>
            <p className="mt-1 text-mini text-mute">
              En begivenhed skal ligge inden i en sæson. Opret sæsonen først.
            </p>
            <Link
              href="/admin/seasons"
              onClick={() => onOpenChange(false)}
              className="mt-2 inline-block text-mini font-semibold text-volt"
            >
              Gå til sæsoner →
            </Link>
          </div>
        ) : null}

        {isMatch ? (
          <>
            {/* Only a fixture is asked where. An away kamp is somewhere new
                every time; a training is always in the home hall. */}
            <label className="block">
              <span className="eyebrow block pb-1.5">Sted</span>
              <input
                className={FIELD}
                value={venue}
                onChange={(e) => {
                  setVenue(e.target.value);
                  setError(null);
                }}
                placeholder="Pakhus77"
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className="eyebrow block pb-1.5">Modstander</span>
              <input
                className={FIELD}
                value={opponent}
                onChange={(e) => setOpponent(e.target.value)}
                placeholder="Astronauterne"
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className="eyebrow block pb-1.5">Spillere på holdet</span>
              <input
                type="number"
                min={1}
                max={40}
                className={cn(FIELD, "num")}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
              />
              <span className="mt-1 block text-[10px] text-dim">
                Tallet over- og underskuddet regnes ud fra.
              </span>
            </label>
          </>
        ) : (
          <div>
            <span className="eyebrow block pb-1.5">Baner</span>
            {/* Baner, not places: nobody books twelve spots, they book three
                courts. Four to a court is the conversion, done here. */}
            <div className="grid grid-cols-4 gap-2">
              {COURT_CHOICES.map((courts) => {
                const places = courts * 4;
                return (
                  <button
                    key={courts}
                    onClick={() => {
                      haptic("tap");
                      setCapacity(places);
                    }}
                    className={cn(
                      "rounded-row border py-2 text-center transition-colors",
                      capacity === places
                        ? "border-volt/50 bg-volt/10"
                        : "border-line bg-ink-900",
                    )}
                  >
                    <span className="num block text-[17px] font-black leading-none">
                      {courts}
                    </span>
                    <span className="mt-1 block text-[9px] text-dim">{places} pl.</span>
                  </button>
                );
              })}
            </div>
            <span className="mt-1.5 block text-[10px] text-dim">
              {courtCount(capacity)} · {capacity} pladser
            </span>
          </div>
        )}

        <label className="block">
          <span className="eyebrow block pb-1.5">Note (valgfri)</span>
          <input
            className={FIELD}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isMatch ? "Kør samlet fra hallen" : "Husk bolde"}
            autoComplete="off"
          />
        </label>

        {error ? (
          <div className="rounded-row border border-loss/30 bg-loss/10 px-3 py-2">
            <p className="text-mini text-loss">{error}</p>
          </div>
        ) : null}

        <Button variant="volt" size="lg" className="w-full" disabled={pending} onClick={submit}>
          {event
            ? update.isPending
              ? "Gemmer…"
              : "Gem ændringer"
            : create.isPending
              ? "Opretter…"
              : isMatch
                ? "Opret kampen"
                : "Opret træningen"}
        </Button>
      </div>
    </Sheet>
  );
}
