"use client";

import { AvailabilityList } from "@/components/program/availability-list";
import { SectionHeader } from "@/components/ui/section";
import { Avatar } from "@/components/ui/avatar";
import { surplus } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EventDetailOut } from "@/lib/types";

/**
 * A league fixture: who is klar, and who has been picked.
 *
 * Those are two separate blocks and they stay two separate blocks. The old
 * spreadsheet only ever answered the first question, and the thing the team
 * asked for is the second one — but a screen that ran them together would be
 * telling ten people they are playing when six of them are.
 *
 * OWNED BY THE KAMPE AGENT. The squad picker, the admin controls and the
 * fuller availability grid land here; the foundation ships the read-only
 * version so the feature works end to end from day one.
 */
export function MatchDetail({ event }: { event: EventDetailOut }) {
  const short = event.surplus < 0;
  // Exactly six is not spare capacity, and calling it that would make a
  // squad with no cover sound comfortable.
  const exact = event.surplus === 0;

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
              </span>
            }
          />
          <div className="space-y-1.5">
            {event.selected.map((player) => (
              <div
                key={player.id}
                className="flex items-center gap-2.5 rounded-row border border-volt/40 bg-volt/[0.07] px-2.5 py-2"
              >
                <Avatar name={player.name} size="sm" accent />
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold tracking-tight">
                  {player.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="rounded-card border border-line bg-ink-850/40 px-4 py-3 text-mini text-mute">
          Holdet er ikke sat endnu. At melde sig klar er en tilmelding, ikke en
          udtagelse.
        </p>
      )}

      <AvailabilityList event={event} type="match" />
    </div>
  );
}
