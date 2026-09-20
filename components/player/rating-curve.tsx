"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CurvePoint, SeasonOut } from "@/lib/types";
import { formatDateShort, rating as formatRating, delta } from "@/lib/format";

interface Row {
  i: number;
  rating: number;
  played_at: string;
}

function CurveTooltip({
  active,
  payload,
  first,
}: {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
  /** Rating after the first match — the earliest number this screen may show. */
  first: number;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-[8px] border border-line bg-ink-900/95 px-2.5 py-1.5 shadow-xl">
      <p className="num text-[15px] font-black leading-none text-volt">{formatRating(row.rating)}</p>
      <p className="num mt-1 text-[10px] leading-none text-dim">
        Kamp {row.i} · {formatDateShort(row.played_at)}
      </p>
      {row.i > 1 ? (
        <p className="num mt-0.5 text-[10px] leading-none text-mute">
          {delta(row.rating - first, 0)} siden første kamp
        </p>
      ) : null}
    </div>
  );
}

/** A season boundary the curve actually crosses. */
interface Shift {
  /** The x value of the first match played inside `season`. */
  x: number;
  season: SeasonOut;
}

/**
 * Where each label goes, so that none of them leaves the plot.
 *
 * A season that started last month sits at the right-hand edge of a long
 * career, and a label drawn to the right of that line is a label nobody can
 * read — which is exactly what happened to "Efterår 2026". So the label flips
 * to the inside of the line once the shift is past the two-thirds mark, and
 * consecutive labels alternate top and bottom so two nearby seasons do not
 * print on top of each other.
 */
function labelPosition(fraction: number, index: number) {
  const vertical = index % 2 === 0 ? "Top" : "Bottom";
  const side = fraction > 0.66 ? "Right" : "Left";
  return `inside${vertical}${side}` as const;
}

/**
 * Every match the player has played, in order — `curve` is the rating after
 * each one, oldest first.
 *
 * The line deliberately starts at the first match rather than at the entry
 * rating. AGENTS.md: `entry_rating` is an admin's private judgement and never
 * appears outside the admin player screen, so it is neither plotted here nor
 * named in the tooltip.
 *
 * Every season the curve crosses gets a dashed line, not just the current one:
 * the interesting question about a rating curve is which half-year a run of
 * form belongs to. The current season keeps the accent; the older shifts are
 * grey, so the chart still reads as one line with markers on it.
 */
export function RatingCurve({ curve, seasons }: { curve: CurvePoint[]; seasons: SeasonOut[] }) {
  const rows = useMemo<Row[]>(
    () => curve.map((point, i) => ({ i: i + 1, rating: point.rating, played_at: point.played_at })),
    [curve],
  );

  const shifts = useMemo<Shift[]>(() => {
    const ordered = [...seasons].sort((a, b) => a.starts_on.localeCompare(b.starts_on));
    // Keyed by x: a player who sat out a whole season has two seasons starting
    // at the same match, and the later one is the season that match belongs to.
    const atMatch = new Map<number, SeasonOut>();
    for (const season of ordered) {
      const index = rows.findIndex((row) => row.played_at.slice(0, 10) >= season.starts_on);
      // Index 0 is the first match of the career: the curve begins there, so
      // there is no shift to mark.
      if (index > 0) atMatch.set(rows[index].i, season);
    }
    return [...atMatch.entries()]
      .map(([x, season]) => ({ x, season }))
      .sort((a, b) => a.x - b.x);
  }, [rows, seasons]);

  if (rows.length < 2) {
    return (
      <div className="flex h-[140px] items-center justify-center rounded-card border border-dashed border-ink-600/70 text-mini text-dim">
        Kurven tegnes efter første kamp.
      </div>
    );
  }

  const values = rows.map((row) => row.rating);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(14, (hi - lo) * 0.16);

  return (
    <div className="overflow-hidden rounded-card border border-line-soft bg-ink-850/50 py-2 pr-2">
      <ResponsiveContainer width="100%" height={168}>
        <AreaChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-volt)" stopOpacity={0.34} />
              <stop offset="100%" stopColor="var(--color-volt)" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="var(--color-line-soft)" vertical={false} />

          <XAxis dataKey="i" hide />
          <YAxis
            domain={[Math.floor(lo - pad), Math.ceil(hi + pad)]}
            width={40}
            tick={{ fill: "var(--color-dim)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickCount={4}
          />

          {shifts.map((shift, index) => {
            const fraction = rows.length > 1 ? (shift.x - 1) / (rows.length - 1) : 0;
            const tone = shift.season.is_current
              ? "var(--color-volt-deep)"
              : "var(--color-ink-500)";
            return (
              <ReferenceLine
                key={shift.season.id}
                x={shift.x}
                stroke={tone}
                strokeDasharray="2 4"
                label={{
                  value: shift.season.name.toUpperCase(),
                  position: labelPosition(fraction, index),
                  fill: tone,
                  fontSize: 9,
                  letterSpacing: "0.1em",
                }}
              />
            );
          })}

          <Tooltip
            cursor={{ stroke: "var(--color-volt)", strokeWidth: 1, strokeOpacity: 0.4 }}
            content={<CurveTooltip first={values[0]} />}
          />

          <Area
            type="monotone"
            dataKey="rating"
            stroke="var(--color-volt)"
            strokeWidth={2}
            fill="url(#curve-fill)"
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 3, fill: "var(--color-volt)", stroke: "var(--color-ink-950)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
