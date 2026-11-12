import type { RunSnapshot } from "../types";
import { cfgNum, instrumentLabel, ivReading, num, pct } from "../lib/format";
import { SeriesChart, ValuationChart } from "../components/SignalCharts";
import { DataDetails } from "../components/DataDetails";

export function WhyPage({ snapshot }: { snapshot: RunSnapshot }) {
  const { signals, rows, meta } = snapshot;
  const minFut = cfgNum(meta.config, "min_futures_fraction", 0.3);
  const capMonths = cfgNum(meta.config, "options_tenor_cap_months", 24);
  const optionRow = rows.find((r) => r.monthsToExposure <= capMonths);
  const lastPrice = signals.price[signals.price.length - 1];
  const sample = rows.filter((r) => [9, 15, 24, 30, 48].includes(r.monthsToExposure));
  const rrAbove = signals.rr.current >= signals.rr.threshold;

  return (
    <>
      <h1>Why the model says this</h1>
      <p className="lede">The four signals behind the decision table, with their current readings.</p>

      <section aria-labelledby="val-h" className="panel">
        <h2 id="val-h">1. Valuation: how much to hedge</h2>
        <p>
          The nearby future is {num(lastPrice.nearby)} against bounds of {num(lastPrice.lower)} to{" "}
          {num(lastPrice.upper)} (average {num(lastPrice.ema)}). The lower the price sits inside the
          bounds, the higher the signal: 100% at the lower bound, 0% at the upper. Each exposure
          month is scored with the price of its own contract.
        </p>
        <ValuationChart data={signals.price} targets={signals.targets} />
        <DataDetails
          summary="View valuation readings by tenor"
          headers={["Months", "Contract", "Contract price", "Valuation signal"]}
          rows={sample.map((r) => [
            r.monthsToExposure, r.contractMonth, num(r.contractPrice), pct(r.valuationSignal, 1),
          ])}
        />
      </section>

      <section aria-labelledby="iv-h" className="panel">
        <h2 id="iv-h">2. Implied volatility: futures or options</h2>
        <p>
          15-month at-the-money-forward implied vol is {num(signals.iv.current * 100)}%, at the{" "}
          {num(signals.iv.percentile, 1)}th percentile of the last {signals.iv.lookbackYears} years:{" "}
          {ivReading(signals.iv.percentile)}.
          {optionRow && (
            <>
              {" "}With a {pct(minFut)} minimum, that gives a raw futures share of{" "}
              {pct(optionRow.futuresFractionRaw, 1)}, rounded to {pct(optionRow.futuresPct)}.
            </>
          )}{" "}
          Beyond {capMonths} months the model uses futures only.
        </p>
        <SeriesChart
          data={signals.iv.series}
          current={signals.iv.current}
          currentLabel="15m ATMF implied vol"
          unit="%"
          ariaLabel="Line chart of 15-month at-the-money-forward implied volatility history with the current value marked"
        />
      </section>

      <section aria-labelledby="skew-h" className="panel">
        <h2 id="skew-h">3. Skew: calls or collars</h2>
        <p>
          The 25-delta risk reversal (call vol minus put vol) is {num(signals.rr.current * 100)} vol
          points, at the {num(signals.rr.percentile, 1)}th percentile of the last{" "}
          {signals.rr.lookbackYears} years. It is {rrAbove ? "above" : "below"} the median of{" "}
          {num(signals.rr.threshold * 100)}, so the choice is{" "}
          <strong>{instrumentLabel(rrAbove ? "CALLS" : "COLLARS")}</strong>
          . GS&apos;s rule picks collars below the 50th percentile and calls otherwise. The choice is
          binary, so it can flip when the percentile crosses 50. The sign convention of the risk
          reversal is still being confirmed (assumption A6).
        </p>
        <SeriesChart
          data={signals.rr.series}
          current={signals.rr.current}
          currentLabel="25d risk reversal"
          referenceValue={signals.rr.threshold}
          referenceLabel="Median (threshold)"
          unit=""
          ariaLabel="Line chart of the 25-delta risk reversal history with the current value and median threshold marked"
        />
      </section>

      <section aria-labelledby="mom-h" className="panel">
        <h2 id="mom-h">4. Momentum</h2>
        {signals.momentum.weight > 0 ? (
          <p>Momentum carries a weight of {pct(signals.momentum.weight)} in the combined signal.</p>
        ) : (
          <p>
            Momentum (RSI) is switched off in this preset: its weight is 0%, so the hedge ratio
            comes from the valuation signal alone. The weight is an open question (assumption A1).
          </p>
        )}
      </section>
    </>
  );
}
