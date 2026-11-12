import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PricePoint, SeriesPoint, TargetMarker } from "../types";

const tickDate = (d: string) => d.slice(0, 7);

export function ValuationChart({ data, targets }: { data: PricePoint[]; targets: TargetMarker[] }) {
  return (
    <div role="img" aria-label="Line chart of nearby Brent price with its moving average and upper and lower valuation bounds, with target contract prices marked">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={tickDate} minTickGap={60} />
          <YAxis domain={["auto", "auto"]} />
          <Tooltip />
          <Line dataKey="upper" name="Upper bound" stroke="#b45309" strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          <Line dataKey="ema" name="EMA" stroke="#555" dot={false} isAnimationActive={false} />
          <Line dataKey="lower" name="Lower bound" stroke="#047857" strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          <Line dataKey="nearby" name="Nearby future" stroke="#0b5cad" strokeWidth={2} dot={false} isAnimationActive={false} />
          {targets.map((t) => (
            <ReferenceLine
              key={t.label}
              y={t.price}
              stroke="#7c3aed"
              strokeDasharray="2 2"
              label={{ value: `${t.label} ${t.price.toFixed(1)}`, position: "insideTopRight", fill: "#7c3aed", fontSize: 12 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface LineProps {
  data: SeriesPoint[];
  current: number;
  currentLabel: string;
  referenceValue?: number;
  referenceLabel?: string;
  scale?: number; // multiply for display (decimal vol -> points)
  unit: string;
  ariaLabel: string;
}

export function SeriesChart({
  data, current, currentLabel, referenceValue, referenceLabel, scale = 100, unit, ariaLabel,
}: LineProps) {
  const shown = data.map((d) => ({ date: d.date, value: d.value * scale }));
  return (
    <div role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={shown} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={tickDate} minTickGap={60} />
          <YAxis domain={["auto", "auto"]} unit={unit} tickFormatter={(v: number) => v.toFixed(1)} />
          <Tooltip formatter={(v) => `${Number(v).toFixed(2)}${unit}`} />
          <Line dataKey="value" name={currentLabel} stroke="#0b5cad" strokeWidth={2} dot={false} isAnimationActive={false} />
          <ReferenceLine
            y={current * scale}
            stroke="#b91c1c"
            label={{ value: `Now ${(current * scale).toFixed(2)}${unit}`, position: "insideTopRight", fill: "#b91c1c", fontSize: 12 }}
          />
          {referenceValue !== undefined && (
            <ReferenceLine
              y={referenceValue * scale}
              stroke="#555"
              strokeDasharray="4 3"
              label={{ value: referenceLabel ?? "", position: "insideBottomRight", fill: "#555", fontSize: 12 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
