"use client";

import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * A padel set does not go past 7. Every one of the 98 evenings on record tops
 * out there, so the pad stops there too — and the two buttons that buys go
 * back into the other eight, which is what a thumb wanted all along.
 */
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7];

/** A match-tie is played to 10 and can run past it; the stepper stops here. */
const MAX_POINTS = 30;

export interface SetDraft {
  games_a: number | null;
  games_b: number | null;
  /** A match-tie as the third set. Its values are points, never games. */
  tiebreak?: boolean;
}

type Tone = "a" | "b";

/**
 * Whose row this is, said before the digits. Hold A is volt and hold B is
 * chalk everywhere on the entry screen, so the label, the bar and the picked
 * digit all wear the same colour as the names in the line-up above.
 */
function TeamLabel({ name, value, tone }: { name: string; value: number | null; tone: Tone }) {
  return (
    <div className="flex items-center gap-1.5 px-0.5 pb-1">
      <span
        className={cn("h-3 w-[3px] shrink-0 rounded-full", tone === "a" ? "bg-volt" : "bg-chalk")}
        aria-hidden
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[12px] font-bold tracking-tight",
          tone === "a" ? "text-volt" : "text-chalk",
        )}
      >
        {name}
      </span>
      <span
        className={cn(
          "num-tight shrink-0 text-[15px] font-black",
          value === null ? "text-ink-600" : tone === "a" ? "text-volt" : "text-chalk",
        )}
      >
        {value ?? "–"}
      </span>
    </div>
  );
}

interface RowProps {
  name: string;
  /** "Sæt 2", "Match-tie": which set this row belongs to, for screen readers. */
  set: string;
  value: number | null;
  onPick: (value: number) => void;
  tone: Tone;
}

function DigitRow({ name, set, value, onPick, tone }: RowProps) {
  return (
    <div role="group" aria-label={`${set} · ${name}`}>
      <TeamLabel name={name} value={value} tone={tone} />
      <div className="flex gap-1">
        {DIGITS.map((digit) => {
          const active = value === digit;
          return (
            <button
              key={digit}
              onClick={() => {
                haptic("tap");
                onPick(digit);
              }}
              aria-label={`${set} · ${name}: ${digit}`}
              aria-pressed={active}
              className={cn(
                "num-tight flex h-11 min-w-0 flex-1 items-center justify-center rounded-[8px] text-[16px] font-bold transition-all duration-100 active:scale-90",
                active
                  ? tone === "a"
                    ? "bg-volt text-volt-ink"
                    : "bg-chalk text-ink-950"
                  : "bg-ink-800 text-mute",
              )}
            >
              {digit}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Points go to ten and beyond, so a match-tie counts up rather than picks. */
function StepperRow({ name, set, value, onPick, tone }: RowProps) {
  const step = (by: number) => {
    haptic("tap");
    onPick(Math.min(MAX_POINTS, Math.max(0, (value ?? 0) + by)));
  };
  const stepper =
    "flex h-11 w-12 shrink-0 items-center justify-center rounded-[8px] bg-ink-800 text-[20px] font-bold text-mute transition-all duration-100 active:scale-90 disabled:opacity-40";
  return (
    <div role="group" aria-label={`${set} · ${name}`} className="flex items-center gap-1.5">
      <span
        className={cn("h-8 w-[3px] shrink-0 rounded-full", tone === "a" ? "bg-volt" : "bg-chalk")}
        aria-hidden
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[12px] font-bold tracking-tight",
          tone === "a" ? "text-volt" : "text-chalk",
        )}
      >
        {name}
      </span>
      <button
        onClick={() => step(-1)}
        disabled={!value}
        aria-label={`${set} · ${name}: et point mindre`}
        className={stepper}
      >
        −
      </button>
      <span
        className={cn(
          "num-tight w-9 shrink-0 text-center text-[22px] font-black",
          value === null ? "text-ink-600" : tone === "a" ? "text-volt" : "text-chalk",
        )}
      >
        {value ?? "–"}
      </span>
      <button onClick={() => step(1)} aria-label={`${set} · ${name}: et point mere`} className={stepper}>
        +
      </button>
    </div>
  );
}

/** One tap per number. A 6-4 7-5 match is four taps. */
export function ScorePad({
  index,
  draft,
  teams,
  onChange,
  onRemove,
}: {
  index: number;
  draft: SetDraft;
  /** Hold A's and hold B's names, in that order. */
  teams: [string, string];
  onChange: (draft: SetDraft) => void;
  onRemove?: () => void;
}) {
  const Row = draft.tiebreak ? StepperRow : DigitRow;
  const set = draft.tiebreak ? "Match-tie" : `Sæt ${index + 1}`;
  return (
    <div className="rounded-row border border-line-soft bg-ink-850/60 p-2.5">
      <div className="flex items-center justify-between gap-2 px-0.5 pb-2">
        <span className="eyebrow">
          {draft.tiebreak ? "Match-tie · point" : `Sæt ${index + 1}`}
        </span>
        {onRemove ? (
          <button
            onClick={onRemove}
            aria-label={draft.tiebreak ? "Fjern match-tie" : `Fjern sæt ${index + 1}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-dim"
          >
            <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden>
              <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="space-y-2">
        <Row
          set={set}
          name={teams[0]}
          value={draft.games_a}
          tone="a"
          onPick={(value) => onChange({ ...draft, games_a: value })}
        />
        <Row
          set={set}
          name={teams[1]}
          value={draft.games_b}
          tone="b"
          onPick={(value) => onChange({ ...draft, games_b: value })}
        />
      </div>
    </div>
  );
}

const ADD =
  "flex w-full items-center justify-center gap-1.5 rounded-row border border-dashed border-line py-2.5 text-[11px] font-bold tracking-[0.12em] text-dim transition-colors active:border-volt/50 active:text-volt";

function Plus() {
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
      <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Regular-set games, summed. A match-tie's points are never partier. */
export function draftGames(sets: SetDraft[]): [number, number] {
  const regular = sets.filter((set) => !set.tiebreak);
  return [
    regular.reduce((sum, set) => sum + (set.games_a ?? 0), 0),
    regular.reduce((sum, set) => sum + (set.games_b ?? 0), 0),
  ];
}

/**
 * Every set has both numbers, and at least one real game was played. A
 * match-tie's points do not count: a kamp of nothing but a match-tie has no
 * games to rate, and the API refuses it.
 */
export function draftReady(sets: SetDraft[]): boolean {
  const complete = sets.every((set) => set.games_a !== null && set.games_b !== null);
  const [gamesA, gamesB] = draftGames(sets);
  return complete && gamesA + gamesB > 0;
}

export function toSetIn(sets: SetDraft[]) {
  return sets.map((set) => ({
    games_a: set.games_a ?? 0,
    games_b: set.games_b ?? 0,
    tiebreak: Boolean(set.tiebreak),
  }));
}

/**
 * The whole list of sets, shared by entering a kamp and correcting one, so
 * the two can never ask for a score in different ways.
 *
 * A third set is either a set or a match-tie, chosen when it is added: the
 * two buttons sit side by side under the second set. A match-tie is only ever
 * the third — that is the format, and the API refuses it anywhere else.
 */
export function SetsEditor({
  sets,
  teams,
  onChange,
}: {
  sets: SetDraft[];
  teams: [string, string];
  onChange: (sets: SetDraft[]) => void;
}) {
  const add = (tiebreak: boolean) => {
    haptic("tap");
    onChange([...sets, { games_a: null, games_b: null, tiebreak }]);
  };
  return (
    <div className="space-y-2">
      {sets.map((draft, index) => (
        <ScorePad
          key={`${index}-${draft.tiebreak ? "mt" : "set"}`}
          index={index}
          draft={draft}
          teams={teams}
          onChange={(next) => onChange(sets.map((set, i) => (i === index ? next : set)))}
          // Only the last set comes off, so a match-tie can never slide
          // forward into second place.
          onRemove={
            sets.length > 1 && index === sets.length - 1
              ? () => onChange(sets.slice(0, -1))
              : undefined
          }
        />
      ))}
      {/* Under the last set, not in the header: you read down the sets you
          have played and the next one is the next thing on screen. Outlined,
          never volt — the save button is the only filled one. */}
      {sets.length === 1 ? (
        <button onClick={() => add(false)} className={ADD}>
          <Plus />
          TILFØJ SÆT
        </button>
      ) : sets.length === 2 ? (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => add(false)} className={ADD}>
            <Plus />
            SÆT 3
          </button>
          <button onClick={() => add(true)} className={ADD}>
            <Plus />
            MATCH-TIE
          </button>
        </div>
      ) : null}
    </div>
  );
}
