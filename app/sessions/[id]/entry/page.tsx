"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PlayerPicker } from "@/components/entry/player-picker";
import { ScorePad, type SetDraft } from "@/components/entry/score-pad";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/ui/section";
import { useAuthGate } from "@/components/auth/auth-gate";
import {
  useCloseSession,
  useCreateMatch,
  useMe,
  usePlayers,
  useSession,
} from "@/lib/queries";
import { participants } from "@/lib/session-stats";
import { firstName, formatDateLong, delta } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { PlayerOut } from "@/lib/types";

/**
 * Rotation that keeps the evening even: the four who have played least, drawn
 * from the people who are demonstrably at the hall. Somebody who has not
 * played a single match tonight is only pulled in when there are not four
 * players to choose from — the API has no session roster to ask.
 *
 * Offered, never applied. A line-up nobody asked for is a line-up that gets
 * saved by accident, so this only ever runs when the suggest button is tapped.
 */
function proposeFour(squad: PlayerOut[], playedTonight: Map<string, number>, nudge: number): string[] {
  const present = squad.filter((p) => (playedTonight.get(p.id) ?? 0) > 0);
  const pool = present.length >= 4 ? present : squad;
  const ordered = [...pool].sort((a, b) => {
    const diff = (playedTonight.get(a.id) ?? 0) - (playedTonight.get(b.id) ?? 0);
    if (diff !== 0) return diff;
    return pool.indexOf(a) - pool.indexOf(b);
  });
  if (ordered.length < 4) return ordered.map((p) => p.id);
  const offset = nudge % ordered.length;
  const rotated = ordered.map((_, i) => ordered[(i + offset) % ordered.length]);
  const four = rotated.slice(0, 4).map((p) => p.id);
  // Strongest with weakest, so the scoreline stays interesting.
  return [four[0], four[3], four[1], four[2]];
}

export default function EntryPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const gate = useAuthGate();
  const me = useMe();
  const session = useSession(id);
  const players = usePlayers();
  const createMatch = useCreateMatch(id);
  const closeSession = useCloseSession(id);

  /** The four names, in order: first two are Hold A. Nobody is picked for you. */
  const [selected, setSelected] = useState<string[]>([]);
  const [sets, setSets] = useState<SetDraft[]>([{ games_a: null, games_b: null }]);
  const [nudge, setNudge] = useState(0);
  const [showAll, setShowAll] = useState(false);
  /**
   * Open, because picking the four is now the first thing this screen asks
   * for. It folds itself away the moment the fourth name is tapped, and from
   * there the score pad and the save bar both fit on a 390×844 screen without
   * scrolling — which is the whole job of this screen.
   */
  const [showPicker, setShowPicker] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const data = session.data;
  const everyone = useMemo(() => players.data ?? [], [players.data]);
  const matches = useMemo(() => data?.matches ?? [], [data?.matches]);

  /** Tonight's squad: whoever has already played, then the rest of the team. */
  const squad = useMemo<PlayerOut[]>(() => {
    const tonight = participants(matches);
    const tonightIds = new Set(tonight.map((p) => p.id));
    const rest = everyone.filter((p) => !tonightIds.has(p.id) && (showAll || !p.is_guest));
    return [...tonight, ...rest];
  }, [matches, everyone, showAll]);

  const playedTonight = useMemo(() => {
    const counts = new Map<string, number>();
    for (const match of matches) {
      for (const p of [...match.team_a, ...match.team_b]) {
        counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
      }
    }
    return counts;
  }, [matches]);

  // What the rotation would pick if it were asked. It is only ever asked by
  // the button, and deriving it rather than storing it keeps the suggestion
  // honest after every save.
  const proposal = useMemo(
    () => (squad.length >= 4 ? proposeFour(squad, playedTonight, nudge) : []),
    [squad, playedTonight, nudge],
  );

  const toggle = (playerId: string) => {
    setError(null);
    const next = selected.includes(playerId)
      ? selected.filter((x) => x !== playerId)
      : selected.length >= 4
        ? [...selected.slice(1), playerId]
        : [...selected, playerId];
    setSelected(next);
    // Four names is the whole job of the grid, so it folds itself back up and
    // hands the screen to the score pad. One tap to reopen if that was wrong.
    if (next.length === 4) setShowPicker(false);
  };

  const gamesA = sets.reduce((sum, set) => sum + (set.games_a ?? 0), 0);
  const gamesB = sets.reduce((sum, set) => sum + (set.games_b ?? 0), 0);
  const complete = sets.every((set) => set.games_a !== null && set.games_b !== null);
  const ready = selected.length === 4 && complete && gamesA + gamesB > 0;

  const teamA = selected.slice(0, 2).map((pid) => everyone.find((p) => p.id === pid));
  const teamB = selected.slice(2, 4).map((pid) => everyone.find((p) => p.id === pid));

  const save = () => {
    if (!ready) {
      setError(
        selected.length !== 4
          ? "Vælg fire spillere."
          : "Kampen skal have mindst ét parti.",
      );
      haptic("warn");
      return;
    }
    createMatch
      .mutateAsync({
        session_id: id,
        team_a: [selected[0], selected[1]],
        team_b: [selected[2], selected[3]],
        // `played_at` is stamped by the server so the replay order is its own.
        sets: sets.map((set) => ({
          games_a: set.games_a ?? 0,
          games_b: set.games_b ?? 0,
        })),
      })
      .then(() => {
        haptic("success");
        setSaved(`${gamesA}–${gamesB} gemt`);
        setSets([{ games_a: null, games_b: null }]);
        // The next match starts empty and asks again, rather than inheriting
        // four names that were right for the match that just finished.
        setSelected([]);
        setShowPicker(true);
        setNudge((n) => n + 3);
        setError(null);
        window.setTimeout(() => setSaved(null), 2200);
      })
      .catch((cause: Error) => {
        haptic("warn");
        setError(cause.message);
      });
  };

  if (!me.isPending && !me.data) {
    return (
      <div className="py-16 text-center">
        <p className="text-body font-semibold">Log ind for at indtaste kampe.</p>
        <p className="mt-1 text-mini text-mute">Alle kan kigge med. Kun holdet kan skrive.</p>
        <Button variant="volt" className="mx-auto mt-5" onClick={() => gate.openLogin()}>
          Log ind
        </Button>
      </div>
    );
  }

  return (
    /* Room at the bottom for the pinned save bar: it is out of the flow, so
       the last row of the page has to leave it a place to stand. */
    <div className="pb-24">
      <Link
        href={`/sessions/${id}`}
        className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-dim"
      >
        <svg viewBox="0 0 8 12" className="h-3 w-2 rotate-180" aria-hidden>
          <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
        TRÆNINGEN
      </Link>

      {session.isPending || !data ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <>
          <header className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow text-volt">Kamp {matches.length + 1}</p>
              <h1 className="mt-1 truncate text-[22px] font-black tracking-[-0.03em]">
                {formatDateLong(data.played_on)}
              </h1>
            </div>
            <span className="num shrink-0 text-[10px] tracking-[0.12em] text-dim">
              {matches.length} GEMT
            </span>
          </header>

          <section className="mt-4">
            <SectionHeader
              title="Hold"
              right={
                // The rotation as a suggestion: one tap fills the four who
                // have played least, another shuffles to the next four.
                <button
                  onClick={() => {
                    haptic("tap");
                    setSelected(proposal);
                    setShowPicker(false);
                    setNudge((n) => n + 1);
                    setError(null);
                  }}
                  disabled={proposal.length < 4}
                  className="text-[10px] font-bold tracking-[0.12em] text-volt disabled:opacity-40"
                >
                  FORESLÅ FIRE
                </button>
              }
            />

            <button
              onClick={() => {
                haptic("tap");
                setShowPicker((value) => !value);
              }}
              aria-expanded={showPicker}
              className="flex w-full items-center gap-2 rounded-card border border-line-soft bg-ink-850/60 px-3 py-2.5 text-left"
            >
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-volt">
                {/* An empty line-up has no names at all, and `every` is true of
                    nothing — so the count is what decides, not the contents. */}
                {teamA.length === 2 && teamA.every(Boolean)
                  ? teamA.map((p) => firstName(p!.name)).join(" & ")
                  : "Vælg to"}
              </span>
              <span className="num shrink-0 px-1 text-[10px] font-black tracking-[0.1em] text-dim">
                MOD
              </span>
              <span className="min-w-0 flex-1 truncate text-right text-[13px] font-bold text-chalk">
                {teamB.length === 2 && teamB.every(Boolean)
                  ? teamB.map((p) => firstName(p!.name)).join(" & ")
                  : "Vælg to"}
              </span>
              <svg
                viewBox="0 0 12 8"
                className={cn("h-2 w-3 shrink-0 text-dim transition-transform", showPicker ? "rotate-180" : "")}
                aria-hidden
              >
                <path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
              </svg>
            </button>

            {showPicker ? (
              <div className="animate-fade">
                <div className="mt-2">
                  <PlayerPicker roster={squad} selected={selected} onToggle={toggle} />
                </div>
                <button
                  onClick={() => setShowAll((value) => !value)}
                  className="mt-2 w-full rounded-pill border border-line py-1.5 text-[11px] font-semibold text-dim"
                >
                  {showAll ? "Skjul gæster" : "Tilføj gæst"}
                </button>
              </div>
            ) : null}
          </section>

          <section className="mt-5">
            <SectionHeader title="Partier" />
            <div className="space-y-2">
              {sets.map((draft, index) => (
                <ScorePad
                  key={index}
                  index={index}
                  draft={draft}
                  onChange={(next) =>
                    setSets((current) => current.map((set, i) => (i === index ? next : set)))
                  }
                  onRemove={
                    sets.length > 1
                      ? () => setSets((current) => current.filter((_, i) => i !== index))
                      : undefined
                  }
                />
              ))}
              {/* Under the last set, not in the header: you read down the sets
                  you have played and the next one is the next thing on screen.
                  Outlined, never volt — "Gem kamp" is the only filled button
                  on this screen and it stays that way. */}
              {sets.length < 3 ? (
                <button
                  onClick={() => {
                    haptic("tap");
                    setSets((current) => [...current, { games_a: null, games_b: null }]);
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-row border border-dashed border-line py-2.5 text-[11px] font-bold tracking-[0.12em] text-dim transition-colors active:border-volt/50 active:text-volt"
                >
                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
                    <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  TILFØJ SÆT
                </button>
              ) : null}
            </div>
          </section>

          {matches.length > 0 ? (
            <section className="mt-6">
              <SectionHeader title="Gemt i aften" />
              <div className="space-y-1">
                {matches.map((match, index) => (
                  <div
                    key={match.id}
                    className="flex items-center gap-1.5 rounded-row bg-ink-850/60 px-3 py-2"
                  >
                    <span className="num w-3.5 shrink-0 text-[10px] text-dim">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-mute">
                      {firstName(match.team_a[0].name)} & {firstName(match.team_a[1].name)}
                      <span className="text-dim"> mod </span>
                      {firstName(match.team_b[0].name)} & {firstName(match.team_b[1].name)}
                    </span>
                    {/* The scoreline, set by set, the way it is said out loud.
                        The game total is what the rating engine adds up, not a
                        result anybody recognises. Never shrinks: the names give
                        way first. */}
                    <span className="flex shrink-0 items-center gap-1">
                      {match.sets.map((set, setIndex) => (
                        <span
                          key={setIndex}
                          className="num-tight text-[13px] font-bold tabular-nums text-chalk"
                        >
                          {set.games_a}
                          <span className="text-dim">-</span>
                          {set.games_b}
                        </span>
                      ))}
                    </span>
                    <span className="num w-[30px] shrink-0 text-right text-[10px] text-dim">
                      {delta(match.deltas[match.team_a[0].id] ?? 0, 0)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {data.status === "open" ? (
            <Button
              variant="ghost"
              className="mx-auto mt-6 block"
              disabled={closeSession.isPending}
              onClick={() => {
                haptic("success");
                closeSession.mutateAsync().then(() => router.push(`/sessions/${id}`));
              }}
            >
              Luk træningssessionen
            </Button>
          ) : null}

          {/* Pinned above the tab bar, clear of the round entry button that
              pokes up out of it. Out of the flow on purpose: "Gem kamp" is
              never a scroll away. While the grid is open it steps aside — the
              grid is a full-height job of its own, and two competing surfaces
              at the bottom of a 390-wide screen is how things end up on top of
              each other. */}
          <div
            className={cn("fixed inset-x-0 z-20 px-4", showPicker ? "hidden" : "")}
            style={{ bottom: "calc(96px + var(--safe-b))" }}
          >
            <div className="mx-auto w-full max-w-[520px] rounded-card border border-line bg-ink-900/92 p-2.5 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-2 px-1 pb-2">
                <span className="min-w-0 flex-1 truncate text-[11px] text-mute">
                  {error ?? saved ?? `Partier i alt ${gamesA}–${gamesB}`}
                </span>
                <span className="num-tight shrink-0 text-[18px] font-black">
                  <span className="text-volt">{gamesA}</span>
                  <span className="px-1 text-dim">:</span>
                  <span className="text-chalk">{gamesB}</span>
                </span>
              </div>
              <Button
                variant="volt"
                size="lg"
                className="w-full"
                disabled={createMatch.isPending}
                onClick={save}
              >
                {createMatch.isPending ? "Gemmer…" : "Gem kamp"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
