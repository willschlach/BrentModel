import { Link } from "react-router-dom";
import type { RunSnapshot } from "../types";
import { cfgNum, instrumentLabel, num, pct } from "../lib/format";

function MathBlock({ children, label }: { children: string; label: string }) {
  return (
    <pre className="math" aria-label={label}>
      {children}
    </pre>
  );
}

export function HomePage({ snapshot }: { snapshot: RunSnapshot }) {
  const { rows, meta, signals } = snapshot;
  const minFut = cfgNum(meta.config, "min_futures_fraction", 0.3);
  const capMonths = cfgNum(meta.config, "options_tenor_cap_months", 24);
  const ex = rows.find((r) => r.monthsToExposure === 15) ?? rows[0];
  const signalPart = ex.rawTargetHr - ex.minHr;

  return (
    <>
      <h1>How the Brent hedging model works</h1>
      <p className="lede">
        A rule-based program that decides, once a month, how much of each future Brent purchase to
        lock in and which instrument to use. It does not forecast the oil price.
      </p>

      <section aria-labelledby="does-h">
        <h2 id="does-h">What it does</h2>
        <ul>
          <li>
            <strong>How much to hedge.</strong> For every exposure month between 9 and 48 months
            ahead, it sets a target hedge ratio: the share of expected volume to have locked in.
          </li>
          <li>
            <strong>What to hedge with.</strong> It splits that target between futures, 25-delta
            calls and zero-cost 25-delta collars.
          </li>
          <li>
            <strong>When.</strong> It runs once a month. Each run only adds hedge. The output is
            the extra amount to place that month for each exposure month.
          </li>
        </ul>
        <p>
          Each exposure month is handled independently. Over time a month&apos;s hedge is built up in
          steps, so its final cost is an average of prices from up to four years of decisions.
        </p>
      </section>

      <section aria-labelledby="flow-h">
        <h2 id="flow-h">The decision flow</h2>
        <ol className="flow">
          <li>
            <strong>Valuation signal</strong>
            <span>Is oil cheap or expensive versus its 10-year history?</span>
            <em>Sets how much to hedge</em>
          </li>
          <li>
            <strong>Volatility percentile</strong>
            <span>Are options cheap or expensive versus history?</span>
            <em>Sets futures versus options</em>
          </li>
          <li>
            <strong>Skew percentile</strong>
            <span>Are puts cheap or expensive relative to calls?</span>
            <em>Sets calls versus collars</em>
          </li>
          <li>
            <strong>Instruction</strong>
            <span>Target minus what is already hedged, split by instrument.</span>
            <em>What to place this month</em>
          </li>
        </ol>
      </section>

      <section aria-labelledby="math-h">
        <h2 id="math-h">The math, step by step</h2>

        <div className="panel">
          <h3>1. Valuation signal: how attractive is today&apos;s price?</h3>
          <p>
            We are a buyer, so a low price is a good time to hedge more. The model measures where
            the price sits inside a band around its long-run average.
          </p>
          <MathBlock label="Valuation signal formulas">{`EMA   = exponentially weighted average of the nearby price (about 10 years)
sigma = exponentially weighted standard deviation (same window)
Upper = EMA + 2 x sigma        Lower = EMA - 2 x sigma

Valuation signal = (Upper - P) / (Upper - Lower),  limited to 0% - 100%
P = price of the futures contract being hedged`}</MathBlock>
          <p className="intuition">
            <strong>Intuition.</strong> At or below the lower band the signal is 100% (hedge as much as
            allowed). At the average it is about 50%. At or above the upper band it is 0% (hedge only
            the minimum). It leans on mean reversion: very high prices tend to be a worse time to lock in.
          </p>
        </div>

        <div className="panel">
          <h3>2. Target hedge ratio: signal plus a safety floor</h3>
          <MathBlock label="Target hedge ratio formula">{`Target = Min + Signal x (Max - Min),  rounded to the nearest 5%

Min (schedule) = (25 - months) x 6.25%   for 9 to 24 months,  0% beyond 24
Max            = 100%`}</MathBlock>
          <p className="intuition">
            <strong>Intuition.</strong> The minimum rises by 6.25 points a month from 24 months out to
            9 months out, which is the same pace as simply buying a little every month. So the program
            is always fully hedged at 9 months whatever the signal says, and the signal only decides how
            far above that floor to go. Close to expiry most of the target is the floor, not the signal.
          </p>
        </div>

        <div className="panel">
          <h3>3. Futures or options: are options cheap?</h3>
          <MathBlock label="Futures share formula">{`Futures share = Fmin + (1 - Fmin) x IV percentile
Fmin = ${pct(minFut)} in this run's preset
IV percentile = rank of today's 15-month ATM-forward implied vol
                within the last 10 years (0 to 100)
Beyond ${capMonths} months: 100% futures`}</MathBlock>
          <p className="intuition">
            <strong>Intuition.</strong> When implied vol is low versus history, options are cheap, so
            the model uses more of them. When vol is high, options cost more, so it falls back to
            futures. The result is rounded to the nearest 5%.
          </p>
        </div>

        <div className="panel">
          <h3>4. Calls or collars: what does skew say?</h3>
          <MathBlock label="Skew rule">{`Risk reversal = IV(25-delta call) - IV(25-delta put)
Skew percentile = rank of today's value within the last 5 years

Below the 50th percentile  ->  zero-cost collars
Otherwise                  ->  outright calls`}</MathBlock>
          <p className="intuition">
            <strong>Intuition.</strong> A collar pays for the call by selling a put, so it costs
            nothing up front but gives up the benefit of prices falling below the put strike. GS&apos;s
            rule uses collars when the skew reading is low and outright calls otherwise. The choice is
            all-or-nothing to keep the number of trades down, so it can flip when the percentile
            crosses 50. The sign convention of the risk reversal is still being confirmed
            (assumption A6), so treat the economic reading of this rule as provisional.
          </p>
        </div>

        <div className="panel">
          <h3>5. The instruction</h3>
          <MathBlock label="Instruction formula">{`Incremental hedge = Target - Current hedge   (never below 0)
Each instrument = Incremental hedge x its share`}</MathBlock>
          <p className="intuition">
            <strong>Intuition.</strong> The model only adds hedge. If the signal falls after a hedge is
            placed, the existing hedge stays and the month shows &quot;Ahead of target&quot;.
          </p>
        </div>
      </section>

      <section aria-labelledby="ex-h">
        <h2 id="ex-h">Worked through with this run&apos;s {ex.monthsToExposure}-month row</h2>
        <div className="panel">
          <MathBlock label="Worked example from the current run">{`Valuation signal : ${pct(ex.valuationSignal, 1)}
Target           : ${pct(ex.minHr, 1)} + ${pct(ex.valuationSignal, 1)} x (${pct(ex.maxHr)} - ${pct(ex.minHr, 1)})
                 = ${pct(ex.rawTargetHr, 1)}  ->  rounded to ${pct(ex.targetHr)}
                   (floor ${pct(ex.minHr, 1)} + signal-driven ${pct(signalPart, 1)})
Current hedge    : ${pct(ex.currentHr)}   ->  incremental ${pct(ex.incrementalHr)}
Futures share    : ${pct(minFut)} + ${pct(1 - minFut)} x ${num(ex.ivPercentile, 1)}% = ${pct(ex.futuresFractionRaw, 1)}  ->  ${pct(ex.futuresPct)}
Skew percentile  : ${num(ex.skewPercentile, 1)}  ->  ${instrumentLabel(ex.instrument)}`}</MathBlock>
          <p className="note">
            Run date {meta.runDate}, data source {meta.dataSource}. Nearby price is{" "}
            {num(signals.price[signals.price.length - 1].nearby)}.{" "}
            <Link to="/decision">See every exposure month</Link>.
          </p>
        </div>
      </section>

      <section aria-labelledby="not-h">
        <h2 id="not-h">What the model is, and is not</h2>
        <ul>
          <li>
            <strong>It is</strong> a disciplined way to spread purchases over time, buy more when
            prices are low, and avoid paying up for options when they are expensive.
          </li>
          <li>
            <strong>It aims for</strong> a lower and steadier average cost than simply buying futures
            9 months ahead. GS reported, in a 10-year backtest, a 5.5% to 6.4% lower price and 37% to
            47% lower volatility for its top 20 models versus 9-month rolling futures. That is
            in-sample, from a search over thousands of models, and excludes trading costs.
          </li>
          <li>
            <strong>It is not</strong> a forecast, and it will not beat the alternatives every month.
            Individual months can come out worse than a simple benchmark by design.
          </li>
        </ul>
      </section>

      <section aria-labelledby="switch-h">
        <h2 id="switch-h">When a month goes badly: should we change strategy?</h2>
        <p>
          Generally no. One month is not enough evidence to change the program, and here is why.
        </p>
        <ul>
          <li>
            <strong>A month is the end of a long process.</strong> The cost of one exposure month
            reflects decisions made over the previous 9 to 48 months. A single bad outcome says very
            little about whether the rules are sound.
          </li>
          <li>
            <strong>The strategy was chosen for the long run.</strong> It was selected on 10-year
            average price, year-on-year volatility and stability across sub-periods. A strategy that
            wins on average still loses in a meaningful share of individual months.
          </li>
          <li>
            <strong>Switching after a bad month chases noise.</strong> Whichever alternative looks
            best over recent months is partly luck. Moving to it adds trades and costs, and
            tends to leave you holding last month&apos;s winner just as conditions change. A strategy
            that is swapped whenever it disappoints never gets a fair test.
          </li>
        </ul>

        <div className="split">
          <div className="panel">
            <h3>Not a reason to change</h3>
            <ul>
              <li>One or two months worse than a benchmark</li>
              <li>A hedge that looks poor after a sharp price move in one direction</li>
              <li>A better-looking alternative in hindsight</li>
            </ul>
          </div>
          <div className="panel">
            <h3>Reasonable triggers for a review</h3>
            <ul>
              <li>A data or implementation error found in the inputs or rules</li>
              <li>A structural change that breaks a model assumption (for example, how the
                contracts or options market work)</li>
              <li>Sustained underperformance, over a long window, outside the range seen in the
                backtest</li>
              <li>A change in the business objective or hedging policy</li>
            </ul>
          </div>
        </div>

        <p>
          One caveat in the other direction: the strategy came from picking the best of many
          candidates on past data, so real results may be weaker than the backtest. That is a reason
          to monitor against pre-agreed limits, not to react to single months. The practical rule is
          to decide the review criteria and cadence now, before the next bad month, and to judge any
          change by a full backtest rather than by recent results.
        </p>
        <p className="note">
          Planned for the performance view: for each month, where its result falls within the full
          historical distribution, and the share of months the strategy beat the benchmark. That gives
          a bad month its proper context.
        </p>
      </section>

      <section aria-labelledby="next-h">
        <h2 id="next-h">Where to go next</h2>
        <ul>
          <li><Link to="/decision">Decision</Link>: what to place this month, with flags.</li>
          <li><Link to="/why">Why</Link>: the signals behind it, with charts.</li>
          <li><Link to="/data">Data and audit</Link>: data health, settings and open assumptions.</li>
        </ul>
        <p className="note">
          This build shows {meta.dataSource} data. Several GS parameters are still assumptions; see
          the assumptions register before relying on any number.
        </p>
      </section>
    </>
  );
}
