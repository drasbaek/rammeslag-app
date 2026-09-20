"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AttendancePicker } from "@/components/entry/attendance-picker";
import { PlayerPicker } from "@/components/entry/player-picker";
import { ScorePad, type SetDraft } from "@/components/entry/score-pad";
import { PlannedList } from "@/components/session/planned-list";
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
import { readAttendance, writeAttendance } from "@/lib/attendance";
import { firstName, formatDateLong, delta } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { PlannedGameOut, PlayerOut } from "@/lib/types";

/**
 * Rotation that keeps the evening even: the four who have played least, drawn
 * from tonight's squad — which is now the people the screen was told are at
 * the hall, rather than a guess made from who happens to have played already.
 *
 * Offered, never applied. A line-up nobody asked for is a line-up that gets
 * saved by accident, so this only ever runs when the suggest button is tapped.
 */
function proposeFour(squad: PlayerOut[], playedTonight: Map<string, number>, nudge: number): string[] {
  const ordered = [...squad].sort((a, b) => {
    const diff = (playedTonight.get(a.id) ?? 0) - (playedTonight.get(b.id) ?? 0);
    if (diff !== 0) return diff;
    return squad.indexOf(a) - squad.indexOf(b);
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
   * Tonight's squad, and the answer being edited.
   *
   * `chosen` is the roster this phone was given, read straight out of storage
   * — null when it has not been asked yet, which is also what the server
   * render sees, and by the time anything depends on it the evening has
   * loaded. `draft` is non-null exactly while the "who is here" question is on
   * screen, so changing your mind halfway never takes somebody out from under
   * a line-up that is already picked.
   */
  const [chosen, setChosen] = useState<string[] | null>(() => readAttendance(id));
  const [draft, setDraft] = useState<string[] | null>(null);
  /**
   * Open, because picking the four is the first thing this screen asks for
   * once it knows who is here. It folds itself away the moment the fourth name
   * is tapped, and from there the score pad and the save bar both fit on a
   * 390×844 screen without scrolling — which is the whole job of this screen.
   */
  const [showPicker, setShowPicker] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const data = session.data;
  const everyone = useMemo(() => players.data ?? [], [players.data]);
  const matches = useMemo(() => data?.matches ?? [], [data?.matches]);
  /** The træning's kampe, and which of them still need a score. */
  const planned = useMemo(() => data?.planned ?? [], [data?.planned]);
  const missing = planned.filter((game) => game.match_id === null).length;

  /**
   * Everybody on the plan. This is the evening's squad as the server knows
   * it, so it is the same on every phone — unlike `lib/attendance`, which is
   * one person's answer on one device. An evening with a plan therefore never
   * opens by asking who is here: it was decided when the kampe were set.
   */
  const plannedPlayers = useMemo<string[]>(() => {
    const ids = new Set<string>();
    for (const game of planned) {
      for (const player of [...game.team_a, ...game.team_b]) ids.add(player.id);
    }
    return [...ids];
  }, [planned]);

  /**
   * Who is at the hall: the answer this phone gave, or — on a phone joining an
   * evening that is already under way — whoever has played a match tonight.
   * Derived rather than stored, so a second device picks the evening up
   * without being asked a question the matches already answer.
   */
  const present = useMemo<string[]>(() => {
    if (chosen) return chosen;
    if (plannedPlayers.length > 0) return plannedPlayers;
    return participants(matches).map((p) => p.id);
  }, [chosen, plannedPlayers, matches]);

  /** Tonight's squad, in the roster's own alphabetical order. */
  const squad = useMemo<PlayerOut[]>(() => {
    const here = new Set(present);
    return everyone.filter((p) => here.has(p.id));
  }, [everyone, present]);

  /**
   * Everybody who can be ticked off as present. Guests hide behind a toggle —
   * except one already on tonight's list, who would otherwise disappear from
   * the screen that is asking about them.
   */
  const rosterToAsk = useMemo<PlayerOut[]>(
    () => everyone.filter((p) => showAll || !p.is_guest || (draft ?? present).includes(p.id)),
    [everyone, showAll, draft, present],
  );

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

  /**
   * A planned kamp, straight into the picker: hold A first, in the order the
   * plan wrote them, which is the order "Gem kamp" will save them in. It fills
   * the names and nothing else — the score is still typed and still saved by
   * hand, so a plan on its own never becomes a match.
   */
  const pickPlanned = (game: PlannedGameOut) => {
    setSelected([...game.team_a, ...game.team_b].map((player) => player.id));
    setShowPicker(false);
    setError(null);
  };

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

  /**
   * The question is on screen: either it was opened, or this phone has not
   * answered it for this evening yet. It is asked even when there are matches
   * to seed it from — those five names are who has played, not who is here,
   * and a grid that quietly leaves out the three who just arrived is worse
   * than one tap.
   */
  const answered = chosen !== null || plannedPlayers.length > 0;
  const asking = draft !== null || (Boolean(data) && !answered);
  /** What the tick marks show: the edit in progress, else tonight's squad. */
  const answer = draft ?? present;

  const toggleDraft = (playerId: string) => {
    setDraft(
      answer.includes(playerId)
        ? answer.filter((x) => x !== playerId)
        : [...answer, playerId],
    );
  };

  const confirmAttendance = () => {
    setChosen(answer);
    writeAttendance(id, answer);
    setDraft(null);
    // Somebody taken off the list cannot stay in the line-up they were picked
    // for, so the four are trimmed to the people who are still here.
    setSelected((current) => current.filter((pid) => answer.includes(pid)));
    setShowPicker(true);
    setError(null);
    haptic("success");
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
              <p className="eyebrow text-volt">
                {asking ? "Aftenens spillere" : `Kamp ${matches.length + 1}`}
              </p>
              <h1 className="mt-1 truncate text-[22px] font-black tracking-[-0.03em]">
                {formatDateLong(data.played_on)}
              </h1>
            </div>
            <span className="num shrink-0 text-[10px] tracking-[0.12em] text-dim">
              {matches.length} GEMT
            </span>
          </header>

          {asking ? (
            /* Asked once, before the first line-up: eighteen names scrolled
               past for every single match is the thing this screen was losing
               the evening to. The answer lives on this phone (lib/attendance),
               not in the API — an evening is still its matches. */
            <section className="mt-4">
              <SectionHeader
                title="Hvem er med i aften?"
                right={
                  <button
                    onClick={() => {
                      haptic("tap");
                      const members = rosterToAsk.map((p) => p.id);
                      setDraft(answer.length >= members.length ? [] : members);
                    }}
                    className="text-[10px] font-bold tracking-[0.12em] text-volt"
                  >
                    {answer.length >= rosterToAsk.length ? "RYD" : "VÆLG ALLE"}
                  </button>
                }
              />
              <p className="px-1 pb-2 text-mini text-dim">
                Vælg dem der er i hallen. Resten af aftenen vælges holdene kun blandt dem.
              </p>

              <AttendancePicker roster={rosterToAsk} present={answer} onToggle={toggleDraft} />

              <button
                onClick={() => setShowAll((value) => !value)}
                className="mt-2 w-full rounded-pill border border-line py-1.5 text-[11px] font-semibold text-dim"
              >
                {showAll ? "Skjul gæster" : "Vis gæster"}
              </button>

              <Button
                variant="volt"
                size="lg"
                className="mt-3 w-full"
                disabled={answer.length < 4}
                onClick={confirmAttendance}
              >
                {answer.length < 4
                  ? `Vælg mindst fire (${answer.length})`
                  : `Fortsæt med ${answer.length} spillere`}
              </Button>

              {/* Only once the question has been answered: the first time
                  through, there is nothing behind it to go back to. */}
              {answered ? (
                <Button
                  variant="ghost"
                  className="mx-auto mt-2 block"
                  onClick={() => setDraft(null)}
                >
                  Fortryd
                </Button>
              ) : null}
            </section>
          ) : (
            <>
              {/* The evening's own list, first: on a planned Sunday the job is
                  never "pick four", it is "which of these six is mine". One
                  tap fills the four names below in the order the plan set
                  them, and the score pad is the next thing on screen. */}
              {planned.length > 0 ? (
                <div className="mt-4">
                  <PlannedList
                    planned={planned}
                    matches={matches}
                    selected={selected}
                    onPick={pickPlanned}
                  />
                </div>
              ) : null}

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
                    {/* Somebody turned up late, somebody went home: the roster
                        is one tap from the grid it decides. */}
                    <button
                      onClick={() => {
                        haptic("tap");
                        setDraft(present);
                      }}
                      className="mt-2 w-full rounded-pill border border-line py-1.5 text-[11px] font-semibold text-dim"
                    >
                      Ret fremmødte · {squad.length} med
                    </button>
                  </div>
                ) : null}
              </section>

              <section className="mt-5">
                <SectionHeader title="Partier" />
                <div className="space-y-2">
                  {sets.map((draftSet, index) => (
                    <ScorePad
                      key={index}
                      index={index}
                      draft={draftSet}
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
            </>
          )}

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

          {/* Closing is what turns the evening into the report, so it waits
              for the last score. The API refuses it too — a button that is
              only disabled is a rule that is not true. */}
          {data.status === "open" && !asking ? (
            <div className="mt-6 text-center">
              <Button
                variant="ghost"
                className="mx-auto block"
                disabled={closeSession.isPending || missing > 0}
                onClick={() => {
                  haptic("success");
                  closeSession
                    .mutateAsync()
                    .then(() => router.push(`/sessions/${id}`))
                    .catch((cause: Error) => {
                      haptic("warn");
                      setError(cause.message);
                    });
                }}
              >
                Luk træningen
              </Button>
              {missing > 0 ? (
                <p className="mt-1.5 text-[10px] leading-snug text-dim">
                  Mangler {missing} {missing === 1 ? "resultat" : "resultater"}, før aftenen kan
                  gøres op.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Pinned above the tab bar, clear of the round entry button that
              pokes up out of it. Out of the flow on purpose: "Gem kamp" is
              never a scroll away. While a grid is open it steps aside — a grid
              is a full-height job of its own, and two competing surfaces at the
              bottom of a 390-wide screen is how things end up on top of each
              other. */}
          <div
            className={cn("fixed inset-x-0 z-20 px-4", showPicker || asking ? "hidden" : "")}
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
