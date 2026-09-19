"use client";

import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function Row({
  value,
  onPick,
  tone,
}: {
  value: number | null;
  onPick: (value: number) => void;
  tone: "a" | "b";
}) {
  return (
    <div className="flex gap-[3px]">
      {DIGITS.map((digit) => {
        const active = value === digit;
        return (
          <button
            key={digit}
            onClick={() => {
              haptic("tap");
              onPick(digit);
            }}
            className={cn(
              "num-tight flex h-9 flex-1 items-center justify-center rounded-[7px] text-[13px] font-bold transition-all duration-100 active:scale-90",
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
  );
}

export interface SetDraft {
  games_a: number | null;
  games_b: number | null;
}

/** One tap per number. A 6-4 7-5 match is four taps. */
export function ScorePad({
  index,
  draft,
  onChange,
  onRemove,
}: {
  index: number;
  draft: SetDraft;
  onChange: (draft: SetDraft) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="rounded-row border border-line-soft bg-ink-850/60 p-2.5">
      <div className="flex items-center justify-between px-0.5 pb-2">
        <span className="eyebrow">Sæt {index + 1}</span>
        <div className="flex items-center gap-2">
          <span className="num-tight text-[18px] font-black">
            <span className={draft.games_a === null ? "text-ink-600" : "text-volt"}>
              {draft.games_a ?? "–"}
            </span>
            <span className="px-1 text-dim">:</span>
            <span className={draft.games_b === null ? "text-ink-600" : "text-chalk"}>
              {draft.games_b ?? "–"}
            </span>
          </span>
          {onRemove ? (
            <button
              onClick={onRemove}
              aria-label={`Fjern sæt ${index + 1}`}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-line text-dim"
            >
              <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden>
                <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-[3px]">
        <Row value={draft.games_a} tone="a" onPick={(value) => onChange({ ...draft, games_a: value })} />
        <Row value={draft.games_b} tone="b" onPick={(value) => onChange({ ...draft, games_b: value })} />
      </div>
    </div>
  );
}
