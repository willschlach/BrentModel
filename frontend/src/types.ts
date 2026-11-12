// Mirrors docs/Web_App_Design_Spec.md section 6 (schemaVersion 1).
// HR values are fractions (0.85 = 85%). Dates are ISO strings.

export type Severity = "critical" | "warn" | "info";
export type Instrument = "FUTURES_ONLY" | "CALLS" | "COLLARS";

export interface Flag {
  id: string;
  severity: Severity;
  scope: string; // "run" or "<months>m"
  message: string;
}

export interface Row {
  exposureDate: string;
  contractMonth: string;
  monthsToExposure: number;
  valuationSignal: number;
  minHr: number;
  maxHr: number;
  rawTargetHr: number;
  targetHr: number;
  currentHr: number;
  incrementalHr: number;
  ivPercentile: number;
  futuresFractionRaw: number;
  skewPercentile: number;
  instrument: Instrument;
  futuresPct: number;
  optionsPct: number;
  collarsPct: number;
  incrFutures: number;
  incrOptions: number;
  incrCollars: number;
  contractPrice: number | null;
}

export interface PricePoint {
  date: string;
  nearby: number;
  ema: number;
  upper: number;
  lower: number;
}

export interface SeriesPoint {
  date: string;
  value: number;
}

export interface TargetMarker {
  label: string;
  contractMonth: string;
  price: number;
}

export interface Assumption {
  id: string;
  text: string;
  status: "confirmed" | "assumed" | "placeholder";
}

export type ConfigValue = string | number | boolean | null;

export interface RunSnapshot {
  schemaVersion: 1;
  meta: {
    runDate: string;
    lastDataDate: string;
    generatedAt: string;
    dataSource: string;
    preset: string;
    config: Record<string, ConfigValue>;
  };
  summary: {
    exposures: number;
    withTrades: number;
    avgCurrentHr: number;
    avgTargetHr: number;
    incrementalByInstrument: { futures: number; options: number; collars: number };
  };
  rows: Row[];
  signals: {
    price: PricePoint[];
    targets: TargetMarker[];
    iv: { series: SeriesPoint[]; current: number; percentile: number; lookbackYears: number };
    rr: {
      series: SeriesPoint[];
      current: number;
      percentile: number;
      threshold: number;
      lookbackYears: number;
    };
    momentum: { weight: number };
  };
  flags: Flag[];
  dataHealth: Record<string, Record<string, string | number | boolean>>;
  assumptions: Assumption[];
}
