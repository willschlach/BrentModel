import type { ConfigValue, Instrument } from "../types";

export const pct = (x: number | null | undefined, digits = 0): string =>
  x === null || x === undefined || Number.isNaN(x) ? "–" : `${(x * 100).toFixed(digits)}%`;

// Percentile values are already on a 0-100 scale.
export const pctile = (x: number, digits = 1): string => `${x.toFixed(digits)}`;

export const num = (x: number | null | undefined, digits = 2): string =>
  x === null || x === undefined || Number.isNaN(x) ? "–" : x.toFixed(digits);

export const instrumentLabel = (i: Instrument): string =>
  ({ FUTURES_ONLY: "Futures only", CALLS: "Calls", COLLARS: "Collars" })[i];

export function cfgNum(cfg: Record<string, ConfigValue>, key: string, fallback: number): number {
  const v = cfg[key];
  return typeof v === "number" ? v : fallback;
}

export type TradeStatus = "trade" | "at-target" | "ahead";

export function tradeStatus(current: number, target: number, incremental: number): TradeStatus {
  if (incremental > 1e-9) return "trade";
  if (current - target > 1e-9) return "ahead";
  return "at-target";
}

export const statusLabel: Record<TradeStatus, string> = {
  trade: "Trade",
  "at-target": "At target",
  ahead: "Ahead of target",
};

/** Plain-language read of an implied-vol percentile (0-100). */
export function ivReading(p: number): string {
  if (p < 33) return "low versus history, so options are relatively cheap";
  if (p > 66) return "high versus history, so options are relatively expensive";
  return "mid-range versus history";
}
