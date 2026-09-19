import Link from "next/link";
import type { PairStatOut } from "@/lib/types";
import { firstName, recordLine } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PairKind = "partner" | "burden" | "nemesis" | "prey";

const COPY: Record<PairKind, { label: string; preposition: string; line: string; tone: "up" | "down" }> = {
  partner: { label: "Guldmakker", preposition: "med", line: "Ring til ham fredag.", tone: "up" },
  burden: { label: "Svær kemi", preposition: "med", line: "To gode spillere. Én dårlig plan.", tone: "down" },
  nemesis: { label: "Skrækken", preposition: "mod", line: "Han sover godt om natten.", tone: "down" },
  prey: { label: "Yndlingsoffer", preposition: "mod", line: "Han har stoppet med at tælle.", tone: "up" },
};

/**
 * Chemistry, with receipts. AGENTS.md: every stat shows its sample size, so
 * the record and the match count are part of the headline — never "din bedste
 * makker" on the back of two matches without saying so. `minSample` is the
 * backend's own threshold for naming a pair at all (`highlights.min_sample`).
 */
export function PairCard({
  kind,
  record,
  minSample,
}: {
  kind: PairKind;
  record: PairStatOut;
  minSample: number;
}) {
  const copy = COPY[kind];
  const thin = record.matches <= minSample;
  // In a small field the "worst" partner can still be a winning record. Say so
  // rather than let the label make a claim the numbers do not support.
  const supported =
    copy.tone === "up" ? record.wins > record.losses : record.losses > record.wins;

  return (
    <Link
      href={`/players/${record.player_id}`}
      className={cn(
        "card relative flex min-w-0 flex-col overflow-hidden p-3",
        copy.tone === "up" ? "border-win/20" : "border-loss/20",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-8 -top-10 h-20 w-20 rounded-full blur-2xl",
          copy.tone === "up" ? "bg-win/15" : "bg-loss/15",
        )}
      />
      <span className={cn("eyebrow relative", copy.tone === "up" ? "text-win/80" : "text-loss/80")}>
        {copy.label}
      </span>

      <p className="num relative mt-2 text-stat font-black leading-none">
        {recordLine(record.wins, record.losses, record.draws)}
      </p>

      <p className="relative mt-1.5 truncate text-[13px] font-bold tracking-tight">
        <span className="font-normal text-dim">{copy.preposition} </span>
        {firstName(record.name)}
      </p>

      <p className="num relative mt-1 text-[10px] text-dim">
        {record.matches} {record.matches === 1 ? "kamp" : "kampe"} ·{" "}
        {Math.round(record.win_rate * 100)}% vundet
      </p>

      <p className="relative mt-1.5 text-[10px] italic leading-snug text-mute">
        {thin
          ? "Alt for få kampe til at betyde noget."
          : supported
            ? copy.line
            : "Titlen er ledig — tallene bakker den ikke op endnu."}
      </p>
    </Link>
  );
}
