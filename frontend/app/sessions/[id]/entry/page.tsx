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
import { firstName, formatDateLong, delta } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { Player } from "@/lib/types";

/**
 * Rotation that keeps the evening even: the four who have played least, drawn
 * from the people who are demonstrably at the hall. Somebody who has not
 * played a single match tonight is only pulled in when there are not four
 * players to choose from — the API has no session roster to ask.
 */
function proposeFour(squad: Player[], playedTonight: Map<string, number>, nudge: number): string[] {
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

  /** null means "use the proposal" — the roster is sticky, the picks are not. */
  const [picked, setPicked] = useState<string[] | null>(null);
  const [sets, setSets] = useState<SetDraft[]>([{ games_a: null, games_b: null }]);
  const [nudge, setNudge] = useState(0);
  const [showAll, setShowAll] = useState(false);
  /** The grid is for corrections. Collapsed, the score pad is above the fold. */
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const data = session.data;
  const everyone = useMemo(() => players.data ?? [], [players.data]);

  /** Tonight's squad: whoever has played, then the rest of the team. */
  const squad = useMemo<Player[]>(() => {
    const tonight = data?.players ?? [];
    const tonightIds = new Set(tonight.map((p) => p.id));
    const rest = everyone.filter((p) => !tonightIds.has(p.id) && (!p.is_guest || showAll));
    return showAll ? [...tonight, ...rest] : [...tonight, ...rest.filter((p) => !p.is_guest)];
  }, [data?.players, everyone, showAll]);

  const playedTonight = useMemo(() => {
    const counts = new Map<string, number>();
    for (const match of data?.matches ?? []) {
      for (const p of [...match.team_a, ...match.team_b]) {
        counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
      }
    }
    return counts;
  }, [data?.matches]);

  // The roster is sticky and a line-up is always on screen: the next match is
  // two taps on the score and one on save. Deriving it instead of writing it
  // into state in an effect keeps the proposal honest after every save.
  const proposal = useMemo(
    () => (squad.length >= 4 ? proposeFour(squad, playedTonight, nudge) : []),
    [squad, playedTonight, nudge],
  );
  const selected = picked ?? proposal;

  const toggle = (playerId: string) => {
    setError(null);
    const current = picked ?? proposal;
    if (current.includes(playerId)) {
      setPicked(current.filter((x) => x !== playerId));
    } else if (current.length >= 4) {
      setPicked([...current.slice(1), playerId]);
    } else {
      setPicked([...current, playerId]);
    }
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
        team_a_player1_id: selected[0],
        team_a_player2_id: selected[1],
        team_b_player1_id: selected[2],
        team_b_player2_id: selected[3],
        sets: sets.map((set, index) => ({
          set_number: index + 1,
          games_a: set.games_a ?? 0,
          games_b: set.games_b ?? 0,
        })),
      })
      .then(() => {
        haptic("success");
        setSaved(`${gamesA}–${gamesB} gemt`);
        setSets([{ games_a: null, games_b: null }]);
        setPicked(null);
        setNudge((n) => n + 3);
        setError(null);
        window.setTimeout(() => setSaved(null), 2200);
      })
      .catch((cause: Error) => {
        haptic("warn");
        setError(cause.message);
      });
  };

  if (!me.isPending && !me.data?.player) {
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
    <div className="pb-4">
      <Link
        href={`/sessions/${id}`}
        className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-dim"
      >
        <svg viewBox="0 0 8 12" className="h-3 w-2 rotate-180" aria-hidden>
          <path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
        AFTENEN
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
              <p className="eyebrow text-volt">Kamp {data.matches.length + 1}</p>
              <h1 className="mt-1 truncate text-[22px] font-black tracking-[-0.03em]">
                {formatDateLong(data.played_on)}
              </h1>
            </div>
            <span className="num shrink-0 text-[10px] tracking-[0.12em] text-dim">
              {data.matches.length} GEMT
            </span>
          </header>

          <section className="mt-4">
            <SectionHeader
              title="Hold"
              right={
                <button
                  onClick={() => {
                    haptic("tap");
                    setPicked(null);
                    setNudge((n) => n + 1);
                  }}
                  className="text-[10px] font-bold tracking-[0.12em] text-volt"
                >
                  BYT RUNDT
                </button>
              }
            />

            <button
              onClick={() => {
                haptic("tap");
                setShowPicker((value) => !value);
              }}
              className="flex w-full items-center gap-2 rounded-card border border-line-soft bg-ink-850/60 px-3 py-2.5 text-left"
            >
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-volt">
                {teamA.every(Boolean)
                  ? teamA.map((p) => firstName(p!.name)).join(" & ")
                  : "Vælg to"}
              </span>
              <span className="num shrink-0 px-1 text-[10px] font-black tracking-[0.1em] text-dim">
                MOD
              </span>
              <span className="min-w-0 flex-1 truncate text-right text-[13px] font-bold text-chalk">
                {teamB.every(Boolean)
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
            <SectionHeader
              title="Partier"
              right={
                sets.length < 3 ? (
                  <button
                    onClick={() => {
                      haptic("tap");
                      setSets((current) => [...current, { games_a: null, games_b: null }]);
                    }}
                    className="text-[10px] font-bold tracking-[0.12em] text-volt"
                  >
                    + SÆT
                  </button>
                ) : null
              }
            />
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
            </div>
          </section>

          <div className="sticky bottom-[calc(72px+var(--safe-b))] z-20 mt-4 rounded-card border border-line bg-ink-900/92 p-2.5 backdrop-blur-xl">
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-[11px] text-mute">
                {error ?? saved ?? `Partier i alt ${gamesA}–${gamesB}`}
              </span>
              <span className="num-tight text-[18px] font-black">
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

          {data.matches.length > 0 ? (
            <section className="mt-6">
              <SectionHeader title="Gemt i aften" />
              <div className="space-y-1">
                {data.matches.map((match, index) => (
                  <div
                    key={match.id}
                    className="flex items-center gap-2 rounded-row bg-ink-850/60 px-3 py-2"
                  >
                    <span className="num w-4 shrink-0 text-[10px] text-dim">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-mute">
                      {firstName(match.team_a[0].name)} & {firstName(match.team_a[1].name)}
                      <span className="text-dim"> mod </span>
                      {firstName(match.team_b[0].name)} & {firstName(match.team_b[1].name)}
                    </span>
                    <span className="num-tight shrink-0 text-[13px] font-bold">
                      {match.games_a}–{match.games_b}
                    </span>
                    <span className="num w-[38px] shrink-0 text-right text-[10px] text-dim">
                      {delta(
                        match.rating_changes.find((c) => c.player_id === match.team_a[0].id)?.delta ?? 0,
                        0,
                      )}
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
              Luk aftenen
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
