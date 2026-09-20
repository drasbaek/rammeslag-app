"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useCreateGuest, useMe, usePlayers, useSetResponseFor } from "@/lib/queries";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { EventDetailOut, PlayerOut } from "@/lib/types";

const FIELD =
  "w-full rounded-row border border-line bg-ink-900 px-3 py-2.5 text-body text-chalk placeholder:text-dim focus:border-volt/60 focus:outline-none";

/** Danish sorting and Danish letters, so "Søren" is found by typing "sø". */
function normalise(value: string): string {
  return value.trim().toLocaleLowerCase("da-DK");
}

/**
 * Bringing somebody along, by typing their name.
 *
 * Search rather than a roster, because the list this picks from is every guest
 * the team has ever brought plus thirteen members — a scroll that gets longer
 * every Sunday, in a sheet somebody is holding in one hand outside the hall.
 * Four characters of a name is enough to find anyone, and the people who are
 * not on it yet are one button away.
 *
 * Adding a guest is an ordinary yes-answer written on their behalf, which is
 * why nothing here talks about selection: a guest is coming, the same way
 * everybody else is coming.
 */
export function TrainingGuestSheet({
  event,
  open,
  onOpenChange,
}: {
  event: EventDetailOut;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const me = useMe();
  const players = usePlayers();
  const answer = useSetResponseFor(event.id);
  const createGuest = useCreateGuest();

  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** The last name that landed, so the sheet can stay open and say so. */
  const [added, setAdded] = useState<string | null>(null);

  const term = normalise(query);
  const attending = useMemo(
    () => new Set(event.responses.filter((r) => r.state === "yes").map((r) => r.player.id)),
    [event.responses],
  );

  const matches = useMemo(() => {
    if (!term) return [];
    const hits = (players.data ?? []).filter((p) => normalise(p.name).includes(term));
    return hits
      .sort((a, b) => {
        // What you typed at the start of a name beats it in the middle.
        const lead = Number(normalise(b.name).startsWith(term)) - Number(normalise(a.name).startsWith(term));
        return lead !== 0 ? lead : a.name.localeCompare(b.name, "da");
      })
      .slice(0, 8);
  }, [players.data, term]);

  const exact = matches.some((p) => normalise(p.name) === term);
  const pending = answer.isPending || createGuest.isPending;

  const fail = (cause: Error) => {
    haptic("warn");
    setError(cause.message);
  };

  const land = (name: string) => {
    haptic("success");
    setAdded(name);
    setError(null);
    setQuery("");
  };

  const add = (player: PlayerOut) => {
    answer
      .mutateAsync({ playerId: player.id, state: "yes" })
      .then(() => land(player.name))
      .catch(fail);
  };

  const createAndAdd = () => {
    const name = query.trim();
    if (name.length < 2) {
      haptic("warn");
      setError("Skriv hele navnet.");
      return;
    }
    // A name that is already on the roster comes back as that player, so
    // two people adding the same guest is safe rather than an error.
    createGuest
      .mutateAsync({ name })
      .then((guest) => answer.mutateAsync({ playerId: guest.id, state: "yes" }))
      .then(() => land(name))
      .catch(fail);
  };

  /**
   * You answer for a guest because somebody has to. Answering for a member is
   * an admin's job, and the API says so — so the row says so too rather than
   * failing after the tap.
   */
  const mayAnswerFor = (player: PlayerOut): boolean =>
    player.is_guest || Boolean(me.data?.is_admin) || player.id === me.data?.id;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setQuery("");
          setError(null);
          setAdded(null);
        }
        onOpenChange(next);
      }}
      title="Tag en gæst med"
      description="Søg på navnet. Står de ikke på listen, kan du oprette dem her."
    >
      <div className="space-y-3">
        <label className="block">
          <span className="eyebrow block pb-1.5">Navn</span>
          <input
            className={FIELD}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setError(null);
            }}
            placeholder="Fx Bjarne"
            autoComplete="off"
            autoFocus
          />
        </label>

        {added ? (
          <p className="text-mini text-win">
            {added} er tilmeldt. Tag flere med, eller luk.
          </p>
        ) : null}

        {error ? (
          <div className="rounded-row border border-loss/30 bg-loss/10 px-3 py-2">
            <p className="text-mini text-loss">{error}</p>
          </div>
        ) : null}

        {!term ? (
          <p className="py-6 text-center text-mini text-dim">
            Skriv de første bogstaver af navnet.
          </p>
        ) : (
          <div className="space-y-1.5">
            {matches.map((player) => {
              const here = attending.has(player.id);
              const allowed = mayAnswerFor(player);
              return (
                <button
                  key={player.id}
                  disabled={here || pending || !allowed}
                  onClick={() => add(player)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-row border px-2.5 py-2 text-left transition-all duration-150 active:scale-[0.98]",
                    here || !allowed
                      ? "border-line-soft bg-ink-850/40 opacity-60"
                      : "border-line bg-ink-850",
                  )}
                >
                  <Avatar name={player.name} size="sm" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-semibold tracking-tight">
                      {player.name}
                    </span>
                    {here ? (
                      <span className="text-[10px] text-dim">Er allerede tilmeldt</span>
                    ) : !allowed ? (
                      <span className="text-[10px] text-dim">Medlem — svarer selv</span>
                    ) : null}
                  </span>
                  {player.is_guest ? (
                    <span
                      className="flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border border-ink-500 text-[9px] font-black text-dim"
                      title="Gæst"
                      aria-label="Gæst"
                    >
                      G
                    </span>
                  ) : null}
                  {!here && allowed ? (
                    <span className="shrink-0 text-[11px] font-bold text-volt">Tilføj</span>
                  ) : null}
                </button>
              );
            })}

            {!exact ? (
              <div className="rounded-card border border-line bg-ink-850/60 px-3 py-3">
                <p className="text-mini text-mute">
                  {matches.length === 0
                    ? `Ingen hedder ${query.trim()}.`
                    : "Er det en ny gæst?"}
                </p>
                <Button
                  variant="volt"
                  className="mt-2 w-full"
                  disabled={pending}
                  onClick={createAndAdd}
                >
                  {createGuest.isPending ? "Opretter…" : `Opret ${query.trim()} som gæst`}
                </Button>
                <p className="mt-1.5 text-[10px] leading-snug text-dim">
                  Gæsten kommer på listen med det samme og får ingen PIN.
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Sheet>
  );
}
