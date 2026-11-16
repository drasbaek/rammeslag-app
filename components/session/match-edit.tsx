"use client";

import { useState } from "react";
import { SetsEditor, draftReady, toSetIn, type SetDraft } from "@/components/entry/score-pad";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useCorrectScore, useDeleteMatch, useMe } from "@/lib/queries";
import { firstName } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import type { MatchOut } from "@/lib/types";

/**
 * Fix a score that was typed in wrong, on the kamp itself.
 *
 * Without this, the only thing a phone could do about a wrong score was type
 * the right one in as a second kamp — and the ladder counted both. So the
 * correction lives on the match: same four players, same place in the
 * evening, new sets, and the whole history replayed from there.
 *
 * Who played is not editable here. Four wrong names is a different kamp, and
 * an admin removes it rather than rewriting it into somebody else's result.
 */
export function MatchEdit({
  match,
  sessionId,
  onOpenChange,
}: {
  match: MatchOut;
  sessionId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const me = useMe();
  const correct = useCorrectScore(sessionId);
  const remove = useDeleteMatch(sessionId);

  const [sets, setSets] = useState<SetDraft[]>(() =>
    match.sets.map((set) => ({
      games_a: set.games_a,
      games_b: set.games_b,
      tiebreak: set.tiebreak,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  /** Deleting asks twice. A kamp taken out moves everybody after it. */
  const [confirming, setConfirming] = useState(false);

  const pending = correct.isPending || remove.isPending;
  const unchanged =
    sets.length === match.sets.length &&
    sets.every(
      (set, i) =>
        set.games_a === match.sets[i].games_a &&
        set.games_b === match.sets[i].games_b &&
        Boolean(set.tiebreak) === match.sets[i].tiebreak,
    );

  const fail = (cause: Error) => {
    haptic("warn");
    setError(cause.message);
  };

  const save = () => {
    if (!draftReady(sets)) {
      setError("Kampen skal have mindst ét parti.");
      haptic("warn");
      return;
    }
    correct
      .mutateAsync({
        id: match.id,
        body: { sets: toSetIn(sets) },
      })
      .then(() => {
        haptic("success");
        onOpenChange(false);
      })
      .catch(fail);
  };

  const destroy = () => {
    if (!confirming) {
      haptic("warn");
      setConfirming(true);
      return;
    }
    remove
      .mutateAsync(match.id)
      .then(() => {
        haptic("success");
        onOpenChange(false);
      })
      .catch(fail);
  };

  const names = (team: MatchOut["team_a"]) => team.map((p) => firstName(p.name)).join(" & ");

  return (
    <Sheet
      open
      onOpenChange={onOpenChange}
      title="Ret resultatet"
      description={`${names(match.team_a)} mod ${names(match.team_b)}. Ratingen spilles om fra denne kamp.`}
    >
      <div className="space-y-2">
        <SetsEditor
          sets={sets}
          teams={[names(match.team_a), names(match.team_b)]}
          onChange={(next) => {
            setError(null);
            setSets(next);
          }}
        />

        {error ? (
          <div className="rounded-row border border-loss/30 bg-loss/10 px-3 py-2">
            <p className="text-mini text-loss">{error}</p>
          </div>
        ) : null}

        <Button
          variant="volt"
          size="lg"
          className="mt-1 w-full"
          disabled={pending || unchanged}
          onClick={save}
        >
          {correct.isPending ? "Gemmer…" : "Gem rettelse"}
        </Button>

        {/* A kamp that should not exist at all — typed in twice, or typed in
            to "fix" another one. Any member, like every delete in the API:
            the ladder is a replay, so re-entering it restores it exactly. */}
        {me.data ? (
          <div className="border-t border-line-soft pt-3">
            <Button
              variant={confirming ? "danger" : "ghost"}
              className="w-full"
              disabled={pending}
              onClick={destroy}
            >
              {remove.isPending
                ? "Sletter…"
                : confirming
                  ? "Tryk igen for at slette kampen"
                  : "Slet kampen"}
            </Button>
            <p className="mt-1.5 text-center text-[10px] leading-snug text-dim">
              {confirming
                ? "Ratingen spilles om, som om kampen aldrig var spillet."
                : "Til en kamp der slet ikke skulle stå her. Kan ikke fortrydes."}
            </p>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
