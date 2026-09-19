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
import type { RatingPoint, Season } from "@/lib/types";
import { formatDateShort, rating as formatRating, delta } from "@/lib/format";

interface Row {
  i: number;
  rating: number;
  played_at: string;
}

function CurveTooltip({
  active,
  payload,
  entryRating,
}: {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
  entryRating: number;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-[8px] border border-line bg-ink-900/95 px-2.5 py-1.5 shadow-xl">
      <p className="num text-[15px] font-black leading-none text-volt">{formatRating(row.rating)}</p>
      <p className="num mt-1 text-[10px] leading-none text-dim">
        {row.i === 0 ? "Indgangsrating" : `Kamp ${row.i}`} · {formatDateShort(row.played_at)}
      </p>
      {row.i > 0 ? (
        <p className="num mt-0.5 text-[10px] leading-none text-mute">
          {delta(row.rating - entryRating, 0)} siden start
        </p>
      ) : null}
    </div>
  );
}

/**
 * Every match the player has played, in order. The dashed line is where they
 * entered the ladder — an admin's judgement call (docs/RATING.md), not 1000
 * for everybody, so it has to be on the chart.
 */
export function RatingCurve({
  curve,
  entryRating,
  season,
}: {
  curve: RatingPoint[];
  entryRating: number;
  season: Season | null;
}) {
  const rows = useMemo<Row[]>(
    () => curve.map((point, i) => ({ i, rating: point.rating, played_at: point.played_at })),
    [curve],
  );

  const seasonStart = useMemo(() => {
    if (!season) return null;
    const index = rows.findIndex((row) => row.played_at.slice(0, 10) >= season.starts_on);
    return index > 0 ? index : null;
  }, [rows, season]);

  if (rows.length < 2) {
    return (
      <div className="flex h-[140px] items-center justify-center rounded-card border border-dashed border-ink-600/70 text-mini text-dim">
        Kurven tegnes efter første kamp.
      </div>
    );
  }

  const values = rows.map((row) => row.rating);
  const lo = Math.min(...values, entryRating);
  const hi = Math.max(...values, entryRating);
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

          <ReferenceLine
            y={entryRating}
            stroke="var(--color-ink-500)"
            strokeDasharray="3 4"
            label={{
              value: `START ${Math.round(entryRating)}`,
              position: "insideBottomRight",
              fill: "var(--color-dim)",
              fontSize: 9,
              letterSpacing: "0.1em",
            }}
          />

          {seasonStart !== null ? (
            <ReferenceLine
              x={seasonStart}
              stroke="var(--color-volt-deep)"
              strokeDasharray="2 4"
              label={{
                value: season?.name.toUpperCase() ?? "",
                position: "insideTopLeft",
                fill: "var(--color-volt-deep)",
                fontSize: 9,
                letterSpacing: "0.1em",
              }}
            />
          ) : null}

          <Tooltip
            cursor={{ stroke: "var(--color-volt)", strokeWidth: 1, strokeOpacity: 0.4 }}
            content={<CurveTooltip entryRating={entryRating} />}
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
