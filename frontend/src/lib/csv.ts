import type { Row } from "../types";

// Column order follows the GS signal delivery format.
const HEADERS = [
  "Exposure Date", "Contract Month", "Months to Exposure", "Valuation Signal", "Min HR", "Max HR",
  "Rounded Target HR", "Current HR", "Incremental HR", "IV Percentile", "Futures Fraction",
  "Skew Percentile", "Instrument", "Rounded Futures %", "Rounded Options %", "Rounded Collars %",
  "Incr Futures", "Incr Options", "Incr Collars",
];

export function rowsToCsv(rows: Row[], inception: string): string {
  const lines = [["Inception Date", ...HEADERS].join(",")];
  for (const r of rows) {
    lines.push(
      [
        inception, r.exposureDate, r.contractMonth, r.monthsToExposure, r.valuationSignal,
        r.minHr, r.maxHr, r.targetHr, r.currentHr, r.incrementalHr, r.ivPercentile,
        r.futuresFractionRaw, r.skewPercentile, r.instrument, r.futuresPct, r.optionsPct,
        r.collarsPct, r.incrFutures, r.incrOptions, r.incrCollars,
      ].join(","),
    );
  }
  return lines.join("\n");
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
