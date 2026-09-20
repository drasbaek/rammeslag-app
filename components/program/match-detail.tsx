"use client";

import { useState } from "react";
import { AvailabilityList } from "@/components/program/availability-list";
import { MatchAdminBar } from "@/components/program/match-admin-bar";
import { MatchSquadPicker } from "@/components/program/match-squad-picker";
import {
  SQUAD_STATE_TEXT,
  answersOf,
  squadStateLabel,
  stateKey,
  type SquadState,
} from "@/components/program/match-roster";
import { SectionHeader } from "@/components/ui/section";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/queries";
import { surplus } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { EventDetailOut, PlayerOut } from "@/lib/types";

/**
 * A league fixture: who is klar, and who has been picked.
 *
 * Those are two separate blocks and they stay two separate blocks. The old
 * spreadsheet only ever answered the first question, and the thing the team
 * asked for is the second one — but a screen that ran them together would be
 * telling ten people they are playing when six of them are.
 *
 * So the squad block carries each picked player's own answer beside their
 * name. Not as a check that the admin got it right — an admin may pick
 * whoever they like — but because "udtaget" and "klar" are two different
 * facts about the same person and the screen owes the reader both.
 *
 * There is no score anywhere on this screen and there never will be: this is
 * a fixture against another club, and nothing about it reaches the ladder.
 */
export function MatchDetail({ event }: { event: EventDetailOut }) {
  const me = useMe();
  const isAdmin = Boolean(me.data?.is_admin);
  const [picking, setPicking] = useState(false);

  const short = event.surplus < 0;
  // Exactly six is not spare capacity, and calling it that would make a
  // squad with no cover sound comfortable.
  const exact = event.surplus === 0;

  const answers = answersOf(event);
  const stateOf = (player: PlayerOut): SquadState => answers.get(player.id) ?? null;
  const picked = new Set(event.selected.map((player) => player.id));

  // Said klar and was not picked. Only meaningful once a squad exists: before
  // that, nobody is a reserve, they are just available.
  const reserves = event.responses
    .filter((row) => row.state === "yes" && !picked.has(row.player.id))
    .map((row) => row.player);

  const unconfirmed = event.selected.filter((player) => stateOf(player) !== "yes").length;
  const cancelled = event.status === "cancelled";

  return (
    <div className="space-y-5">
      {/* The old sheet's bottom row, and the only number on this screen that
          is arithmetic rather than a fact about a person. */}
      <div className="flex items-center gap-3 rounded-card border border-line bg-ink-850/60 px-4 py-3">
        <div className="flex flex-col">
          <span
            className={cn(
              "num-tight text-stat font-black leading-none",
              short ? "text-loss" : "text-chalk",
            )}
          >
            {event.counts.yes}
            <span className="text-stat-sm text-dim">/{event.capacity}</span>
          </span>
          <span className="mt-1 text-[9px] font-bold tracking-[0.12em] text-dim">
            HAR MELDT SIG KLAR
          </span>
        </div>
        <div className="ml-auto text-right">
          <span
            className={cn(
              "num-tight text-stat font-black leading-none",
              short ? "text-loss" : exact ? "text-chalk" : "text-win",
            )}
          >
            {surplus(event.surplus)}
          </span>
          <span className="mt-1 block text-[9px] font-bold tracking-[0.12em] text-dim">
            {short ? "FOR FÅ" : exact ? "LIGE NOK" : "I OVERSKUD"}
          </span>
        </div>
      </div>

      {event.selected.length > 0 ? (
        <div>
          <SectionHeader
            title="Udtaget"
            right={
              <span className="num text-[13px] font-black text-volt">
                {event.selected.length}
                <span className="text-dim">/{event.capacity}</span>
              </span>
            }
          />
          <div className="space-y-1.5">
            {event.selected.map((player) => {
              const state = stateOf(player);
              const flagged = state !== "yes";
              return (
                <div
                  key={player.id}
                  className={cn(
                    "flex items-center gap-2.5 rounded-row border px-2.5 py-2",
                    flagged
                      ? "border-draw/40 bg-draw/[0.06]"
                      : "border-volt/40 bg-volt/[0.07]",
                  )}
                >
                  <Avatar name={player.name} size="sm" accent={!flagged} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold tracking-tight">
                    {player.name}
                  </span>
                  {/* The player's own answer, in their own words, so the two
                      facts are never collapsed into one. */}
                  <span
                    className={cn(
                      "shrink-0 text-[10px] font-bold tracking-tight",
                      SQUAD_STATE_TEXT[stateKey(state)],
                    )}
                  >
                    {squadStateLabel(state)}
                  </span>
                </div>
              );
            })}
          </div>
          {unconfirmed > 0 ? (
            <p className="mt-1.5 px-1 text-[10px] leading-snug text-dim">
              {unconfirmed === 1
                ? "1 af de udtagne har ikke meldt sig klar i appen."
                : `${unconfirmed} af de udtagne har ikke meldt sig klar i appen.`}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="rounded-card border border-line bg-ink-850/40 px-4 py-3 text-mini text-mute">
          Holdet er ikke sat endnu. At melde sig klar er en tilmelding, ikke en
          udtagelse.
        </p>
      )}

      {isAdmin ? (
        <div>
          <Button
            variant="solid"
            className="w-full"
            disabled={cancelled}
            onClick={() => {
              haptic("tap");
              setPicking(true);
            }}
          >
            {event.selected.length > 0 ? "Ret holdet" : "Sæt holdet"}
          </Button>
          {cancelled ? (
            <p className="mt-1.5 text-center text-[10px] leading-snug text-dim">
              Kampen er aflyst. Genåbn den, hvis holdet skal sættes alligevel.
            </p>
          ) : null}
        </div>
      ) : null}

      {event.selected.length > 0 && reserves.length > 0 ? (
        <div>
          <SectionHeader
            title="Reserver"
            right={
              <span className="num text-[13px] font-black text-win">{reserves.length}</span>
            }
          />
          <div className="space-y-1.5">
            {reserves.map((player) => (
              <div
                key={player.id}
                className="flex items-center gap-2.5 rounded-row border border-line-soft bg-ink-850/60 px-2.5 py-2"
              >
                <Avatar name={player.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight">
                  {player.name}
                </span>
                <span className="shrink-0 text-[10px] font-bold tracking-tight text-win">
                  Klar
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 px-1 text-[10px] leading-snug text-dim">
            Meldt klar, men ikke udtaget. Falder nogen fra, er det herfra.
          </p>
        </div>
      ) : null}

      <AvailabilityList event={event} type="match" />

      {isAdmin ? <MatchAdminBar event={event} /> : null}

      {picking ? (
        <MatchSquadPicker event={event} open onOpenChange={setPicking} />
      ) : null}
    </div>
  );
}
