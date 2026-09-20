"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useSetMatchups } from "@/lib/queries";
import { courtsFor, nameParts } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { EventDetailOut, MatchupIn, PlayerOut } from "@/lib/types";

/** Mirrors MAX_ROUNDS in events/service.py. A plan longer than this is refused. */
const MAX_ROUNDS = 20;

/** Two on Hold A, two on Hold B, in that order — the same order the API takes. */
const SLOTS = 4;

type Board = Record<string, (string | null)[]>;

const key = (round: number, court: number) => `${round}:${court}`;

function emptyCourt(): (string | null)[] {
  return Array.from({ length: SLOTS }, () => null);
}

/** The first court somebody started and did not finish, or null. */
function firstUnfinished(
  board: Board,
  rounds: number,
  courts: number,
): { round: number; court: number } | null {
  for (let round = 1; round <= rounds; round += 1) {
    for (let court = 1; court <= courts; court += 1) {
      const filled = (board[key(round, court)] ?? []).filter(Boolean).length;
      if (filled > 0 && filled < SLOTS) return { round, court };
    }
  }
  return null;
}

/**
 * Rebuild the board from the saved plan.
 *
 * Whatever is on the whiteboard wins over what the baner count says: a plan
 * made for three courts stays readable after somebody drops to two, and the
 * extra court is simply one the admin can clear.
 */
function boardFrom(event: EventDetailOut): { board: Board; rounds: number; courts: number } {
  const board: Board = {};
  let rounds = 1;
  let courts = courtsFor(event.capacity);
  for (const matchup of event.matchups) {
    board[key(matchup.round, matchup.court)] = [
      matchup.team_a[0]?.id ?? null,
      matchup.team_a[1]?.id ?? null,
      matchup.team_b[0]?.id ?? null,
      matchup.team_b[1]?.id ?? null,
    ];
    rounds = Math.max(rounds, matchup.round);
    courts = Math.max(courts, matchup.court);
  }
  return { board, rounds, courts };
}

function Slot({
  player,
  onPick,
}: {
  player: PlayerOut | null;
  onPick: () => void;
}) {
  const parts = player ? nameParts(player.name) : null;
  return (
    <button
      onClick={onPick}
      className={cn(
        "flex h-[42px] w-full items-center rounded-row border px-2 text-left transition-all duration-150 active:scale-[0.97]",
        player ? "border-volt/40 bg-volt/[0.07]" : "border-dashed border-ink-500 bg-ink-900",
      )}
    >
      {parts ? (
        <span className="flex min-w-0 flex-col leading-none">
          {parts.given ? (
            <span className="truncate text-[9px] font-semibold tracking-tight text-dim">
              {parts.given}
            </span>
          ) : null}
          <span
            className={cn(
              "truncate text-[13px] font-bold tracking-tight",
              parts.given && "mt-[3px]",
            )}
          >
            {parts.family}
          </span>
        </span>
      ) : (
        <span className="text-[11px] font-semibold text-dim">Vælg</span>
      )}
    </button>
  );
}

/**
 * Sætter kampene i forvejen: rounds down the screen, baner inside them.
 *
 * The backend's three rules — four different people on a court, a court set
 * once per round, nobody on two baner at the same time — are enforced here by
 * what the picker offers rather than by a message after the save. A player who
 * is already busy in the round is not on the list to pick, so an impossible
 * plan cannot be built, let alone submitted.
 *
 * A court is either empty or a whole kamp. Half a court is the one thing that
 * blocks the save, because four names is what the API stores and three is a
 * plan somebody forgot to finish.
 *
 * At 390px this is a slot grid, not a table: a court is two columns of two
 * names, surname loud, and the rounds stack. A grid of rounds by courts is a
 * spreadsheet, and a spreadsheet on a phone scrolls sideways.
 */
export function TrainingPlanner({
  event,
  open,
  onOpenChange,
}: {
  event: EventDetailOut;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSetMatchups(event.id);
  const initial = useMemo(() => boardFrom(event), [event]);

  const [board, setBoard] = useState<Board>(initial.board);
  const [rounds, setRounds] = useState(initial.rounds);
  const courts = initial.courts;
  const [picking, setPicking] = useState<{ round: number; court: number; index: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  /** Everybody who said yes — members and guests, no difference on a Sunday. */
  const squad = useMemo(
    () =>
      event.responses
        .filter((r) => r.state === "yes")
        .map((r) => r.player)
        .sort((a, b) => a.name.localeCompare(b.name, "da")),
    [event.responses],
  );

  /** Names for everyone the board can hold, including anyone since un-tilmeldt. */
  const byId = useMemo(() => {
    const index = new Map<string, PlayerOut>();
    for (const player of squad) index.set(player.id, player);
    for (const matchup of event.matchups) {
      for (const player of [...matchup.team_a, ...matchup.team_b]) index.set(player.id, player);
    }
    return index;
  }, [squad, event.matchups]);

  const slotsOf = (round: number, court: number) => board[key(round, court)] ?? emptyCourt();

  /** Who is already on a court in this round. A person cannot be two places. */
  const busyIn = (round: number): Set<string> => {
    const busy = new Set<string>();
    for (let court = 1; court <= courts; court += 1) {
      for (const id of slotsOf(round, court)) if (id) busy.add(id);
    }
    return busy;
  };

  const place = (playerId: string | null) => {
    if (!picking) return;
    haptic("tap");
    setBoard((previous) => {
      const slots = [...(previous[key(picking.round, picking.court)] ?? emptyCourt())];
      slots[picking.index] = playerId;
      return { ...previous, [key(picking.round, picking.court)]: slots };
    });
    setPicking(null);
    setError(null);
  };

  const clearCourt = (round: number, court: number) => {
    haptic("tap");
    setBoard((previous) => ({ ...previous, [key(round, court)]: emptyCourt() }));
    setError(null);
  };

  const plan = useMemo<MatchupIn[]>(() => {
    const built: MatchupIn[] = [];
    for (let round = 1; round <= rounds; round += 1) {
      for (let court = 1; court <= courts; court += 1) {
        const slots = board[key(round, court)];
        if (!slots || slots.some((id) => !id)) continue;
        built.push({
          round,
          court,
          team_a: [slots[0] as string, slots[1] as string],
          team_b: [slots[2] as string, slots[3] as string],
        });
      }
    }
    return built;
  }, [board, rounds, courts]);

  /** A court with one, two or three names on it. The only unsaveable state. */
  const unfinished = firstUnfinished(board, rounds, courts);

  const submit = () => {
    if (unfinished) {
      haptic("warn");
      setError(
        `Bane ${unfinished.court} i runde ${unfinished.round} mangler spillere. Fyld den eller ryd den.`,
      );
      return;
    }
    save
      .mutateAsync({ matchups: plan })
      .then(() => {
        haptic("success");
        onOpenChange(false);
      })
      .catch((cause: Error) => {
        haptic("warn");
        setError(cause.message);
      });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={picking ? "Hvem skal på banen?" : "Sæt kampene"}
      description={
        picking
          ? `Runde ${picking.round} · bane ${picking.court} · ${picking.index < 2 ? "hold A" : "hold B"}`
          : "En plan, ikke et resultat. Kampene skrives ind bagefter."
      }
    >
      {picking ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            {squad.map((player) => {
              const slots = slotsOf(picking.round, picking.court);
              const here = slots[picking.index] === player.id;
              // Busy anywhere else in this round, including on this court:
              // four different people, and nobody on two baner at once.
              const busy = !here && busyIn(picking.round).has(player.id);
              const { given, family } = nameParts(player.name);
              return (
                <button
                  key={player.id}
                  disabled={busy}
                  onClick={() => place(player.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-row border px-2.5 py-2 text-left transition-all duration-150 active:scale-[0.98]",
                    here
                      ? "border-volt/50 bg-volt/[0.08]"
                      : busy
                        ? "border-line-soft bg-ink-850/40 opacity-50"
                        : "border-line bg-ink-850",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col leading-none">
                    {given ? (
                      <span className="truncate text-[10px] font-semibold text-dim">{given}</span>
                    ) : null}
                    <span
                      className={cn(
                        "truncate text-[14px] font-bold tracking-tight",
                        given && "mt-[3px]",
                      )}
                    >
                      {family}
                    </span>
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
                  {busy ? (
                    <span className="shrink-0 text-[10px] text-dim">Spiller i runden</span>
                  ) : null}
                </button>
              );
            })}
            {squad.length === 0 ? (
              <p className="py-6 text-center text-mini text-dim">
                Ingen har meldt sig endnu. Kampene sættes ud fra dem, der kommer.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={() => setPicking(null)}>
              Fortryd
            </Button>
            <Button variant="solid" onClick={() => place(null)}>
              Ryd pladsen
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from({ length: rounds }, (_, i) => i + 1).map((round) => (
            <div key={round} className="rounded-card border border-line bg-ink-900/60 px-3 py-2.5">
              <span className="block pb-2 text-[10px] font-black tracking-[0.14em] text-mute">
                RUNDE {round}
              </span>
              <div className="space-y-2">
                {Array.from({ length: courts }, (_, i) => i + 1).map((court) => {
                  const slots = slotsOf(round, court);
                  const filled = slots.filter(Boolean).length;
                  return (
                    <div
                      key={court}
                      className="rounded-row border border-line-soft bg-ink-850/60 px-2 py-2"
                    >
                      <div className="flex items-center justify-between pb-1.5">
                        <span className="text-[9px] font-bold tracking-[0.12em] text-dim">
                          BANE {court}
                        </span>
                        {filled > 0 ? (
                          <button
                            onClick={() => clearCourt(round, court)}
                            className="text-[10px] font-semibold text-dim"
                          >
                            Ryd
                          </button>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
                        <div className="min-w-0 space-y-1.5">
                          {[0, 1].map((index) => (
                            <Slot
                              key={index}
                              player={byId.get(slots[index] ?? "") ?? null}
                              onPick={() => setPicking({ round, court, index })}
                            />
                          ))}
                        </div>
                        <span className="text-[9px] font-black tracking-[0.1em] text-volt">
                          MOD
                        </span>
                        <div className="min-w-0 space-y-1.5">
                          {[2, 3].map((index) => (
                            <Slot
                              key={index}
                              player={byId.get(slots[index] ?? "") ?? null}
                              onPick={() => setPicking({ round, court, index })}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="ghost"
              disabled={rounds <= 1}
              onClick={() => {
                haptic("tap");
                // Only the last one, so no round is ever renumbered under a
                // plan somebody has already read.
                setBoard((previous) => {
                  const next = { ...previous };
                  for (let court = 1; court <= courts; court += 1) delete next[key(rounds, court)];
                  return next;
                });
                setRounds((value) => Math.max(1, value - 1));
              }}
            >
              Fjern runde
            </Button>
            <Button
              variant="solid"
              disabled={rounds >= MAX_ROUNDS}
              onClick={() => {
                haptic("tap");
                setRounds((value) => Math.min(MAX_ROUNDS, value + 1));
              }}
            >
              Tilføj runde
            </Button>
          </div>

          {/* The baner an admin booked. A plan can use fewer, never more. */}
          {courts > courtsFor(event.capacity) ? (
            <p className="text-[10px] leading-snug text-dim">
              Planen bruger {courts} baner, men der er kun booket {courtsFor(event.capacity)}. Ryd
              den sidste bane, eller book en mere.
            </p>
          ) : null}

          {error ? (
            <div className="rounded-row border border-loss/30 bg-loss/10 px-3 py-2">
              <p className="text-mini text-loss">{error}</p>
            </div>
          ) : null}

          <Button
            variant="volt"
            size="lg"
            className="w-full"
            disabled={save.isPending}
            onClick={submit}
          >
            {save.isPending
              ? "Gemmer…"
              : plan.length === 0
                ? "Gem uden kampe"
                : `Gem ${plan.length} ${plan.length === 1 ? "kamp" : "kampe"}`}
          </Button>
          <p className="text-center text-[10px] leading-snug text-dim">
            Ingen resultater her. Kampene skrives ind på aftenen.
          </p>
        </div>
      )}
    </Sheet>
  );
}
