import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Row } from "../types";

const fmtTip = (v: unknown): string =>
  Array.isArray(v) ? `${Number(v[0]).toFixed(1)}% to ${Number(v[1]).toFixed(1)}%` : `${Number(v).toFixed(1)}%`;

export function LadderChart({ rows }: { rows: Row[] }) {
  const data = rows.map((r) => ({
    m: r.monthsToExposure,
    band: [r.minHr * 100, r.maxHr * 100] as [number, number],
    current: r.currentHr * 100,
    target: r.targetHr * 100,
  }));
  return (
    <figure className="chart">
      <figcaption>
        Hedge ratio by months to exposure. The shaded band is the allowed minimum to maximum; the
        gap between current and target is the trade. Full values are in the table below.
      </figcaption>
      <div role="img" aria-label="Ladder chart of current and target hedge ratio against the allowed band, by months to exposure">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="m"
              type="number"
              reversed
              domain={["dataMin", "dataMax"]}
              tickCount={10}
              label={{ value: "Months to exposure", position: "insideBottom", offset: -12 }}
            />
            <YAxis domain={[0, 100]} unit="%" />
            <Tooltip formatter={fmtTip} labelFormatter={(l) => `${String(l)} months out`} />
            <Legend verticalAlign="top" />
            <Area
              dataKey="band"
              name="Allowed band"
              type="stepAfter"
              fill="#c7d6ee"
              stroke="none"
              isAnimationActive={false}
            />
            <Line dataKey="current" name="Current" type="stepAfter" stroke="#444" strokeWidth={2}
              strokeDasharray="6 3" dot={false} isAnimationActive={false} />
            <Line dataKey="target" name="Target" type="stepAfter" stroke="#0b5cad" strokeWidth={2.5}
              dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function InstrumentChart({ rows }: { rows: Row[] }) {
  const data = rows.map((r) => ({
    m: r.monthsToExposure,
    Futures: r.incrFutures * 100,
    Options: r.incrOptions * 100,
    Collars: r.incrCollars * 100,
  }));
  const total = data.reduce((s, d) => s + d.Futures + d.Options + d.Collars, 0);
  return (
    <figure className="chart">
      <figcaption>
        New hedge to place this month, by instrument (percent of that month&apos;s volume).
        {total === 0 && " Nothing to place: every month is at or ahead of target."}
      </figcaption>
      <div role="img" aria-label="Stacked bars of incremental futures, options and collars by months to exposure">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="m" reversed label={{ value: "Months to exposure", position: "insideBottom", offset: -12 }} />
            <YAxis unit="%" />
            <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} labelFormatter={(l) => `${String(l)} months out`} />
            <Legend verticalAlign="top" />
            <Bar dataKey="Futures" stackId="a" fill="#0b5cad" isAnimationActive={false} />
            <Bar dataKey="Options" stackId="a" fill="#d97706" isAnimationActive={false} />
            <Bar dataKey="Collars" stackId="a" fill="#6b7280" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
