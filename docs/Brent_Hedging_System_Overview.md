# Brent Dynamic Hedging Model: System Overview for Business Confirmation

**Document date:** 10 November 2026
**Purpose:** Describe the full system we are rebuilding, stage by stage, with the current status of each part, and list the points the business side needs to confirm.
**Reference models:** (a) the original GS 9–24 month study (the "24m deck"); (b) the September 2026 GS 9–48 month specification (the "48m spec").

---

## 1. Executive summary

We are rebuilding the GS Brent hedging toolbox. Once a month, for each forward exposure month, it decides:

1. **How much** to hedge (a target hedge ratio),
2. **With what** (futures, 25-delta calls, or zero-cost 25-delta collars).

The code for the full chain is written and tested for correctness on synthetic data. **No real market data has been run through it yet.** Until it is, we cannot claim the rebuild reproduces GS's numbers. The main blockers are:

- LSEG data has not arrived (format, contract naming and history depth are unknown).
- Some GS parameters are not stated in the documents we hold (see Section 9).
- The options-volatility inputs may need a strike-level conversion step that is not yet built.

### Status at a glance

| # | Stage | Status | One-line reason if not complete |
|---|-------|--------|---------------------------------|
| 1 | Data | **Partly built, blocked** | LSEG format unknown; chain-to-25-delta conversion not built |
| 2 | Signal construction | **Built, unvalidated** | Correct on synthetic data and worked examples; not checked against real prices |
| 3 | Calibration and independent validation | **Built, not run** | Needs real data; several parameters undefined |
| 4 | Backtesting | **Built, not run on real data** | Needs real data; metric definitions are interpretations |
| 5 | Integration into a production framework | **Partly built** | Monthly runner exists; scheduling, reconciliation and controls not started |

**Status legend**
- **Complete:** built and verified to the extent verification is possible.
- **Built, unvalidated:** code exists and passes tests on synthetic data or the GS worked examples. Not yet checked against real data.
- **Blocked:** cannot proceed without an input from the business or a vendor.
- **Not started:** no code yet.

---

## 2. System architecture

```
 Stage 1: DATA
 futures prices (nearby + each contract)      options / implied vol data
          |                                            |
          v                                            v
 Stage 2: SIGNALS
 Momentum (RSI)      Valuation          Historical IV         Volatility skew
                     (vol bounds /      percentile            (25d risk reversal
                     hist. percentile)                        percentile)
          \               /                    |                   |
           \             /                     |                   |
        Hedge ratio signal                Futures vs options   Calls vs collars
                |                                |                   |
                +----------------+---------------+-------------------+
                                 v
                  Toolbox allocation (per exposure month)
                                 |
        +------------------------+-------------------------+
        v                                                  v
 Stage 3 / 4: CALIBRATE, VALIDATE, BACKTEST        Stage 5: MONTHLY RUN
 (history -> choose parameters)                    (today's data -> instructions)
```

The model is **stateful**: each monthly run needs the hedge ratio already in place for each exposure month.

The model treats **each exposure month independently**. There is no sequential coverage logic across contracts.

---

## 3. Stage 1: Data

### 3.1 Required inputs

| # | Data | Used for | Minimum history |
|---|------|----------|-----------------|
| 1 | Nearby (spot) Brent futures price, daily | Valuation bounds, historical percentile, RSI | 10+ years |
| 2 | Price of each target futures contract, daily | Valuation signal for the target month, hedge execution prices, contract settlement | 10+ years, out to 24 or 48 months forward |
| 3 | 15-month ATMF implied volatility, daily | Futures vs options signal | 10+ years |
| 4 | 25-delta call and put implied volatility, 15-month, daily | Calls vs collars signal; option and collar pricing | 5+ years |
| 5 | Strike-level option chain (optional) | Derive items 3 and 4 if the vendor does not supply them directly | Same as above |

### 3.2 What is built

| Component | Status | Notes |
|-----------|--------|-------|
| Data container with point-in-time queries (no look-ahead) | Complete | Tested |
| CSV loader with column renaming | Built, unvalidated | Layout defined by us (`nearby.csv`, `vol.csv`, `curve.csv` or `contracts.csv`); not yet checked against a real LSEG export |
| Data-quality report (history length, gaps, duplicates, non-positive prices, vols as decimals vs percentages) | Built, unvalidated | Run it first on any new data |
| Contract expiry rule (ICE Brent: last business day of the second month before the contract month) | Built, unvalidated | Holidays not modelled; needs confirmation (A8, A22) |
| Black-76 pricing, delta-to-strike conversion, implied vol solver | Complete | Round-trip tested (put-call parity, delta to strike and back, price to vol and back) |
| Synthetic data generator | Complete | For testing only. Not suitable for calibration |

### 3.3 What is not built, and why

| Component | Status | Reason |
|-----------|--------|--------|
| LSEG adapter (field names, contract identifiers, rolling series) | **Blocked** | Data format and delivery pipeline are not yet known |
| Option chain to 25-delta / ATMF vol builder (interpolating the smile) | **Not started** | Depends on whether LSEG provides constant-maturity vols directly. Building it before we know would be speculative |
| Handling of data gaps, holidays, bad ticks | **Not started** | Needs real data to see what actually occurs |

### 3.4 Items for business confirmation
- Who owns the LSEG data feed, and what is the delivery format (file export, API, other)?
- Is 15-month ATMF and 25-delta vol provided directly, or only strike-level chains?
- What is the delta convention (forward, discounted, premium-adjusted)? We assume undiscounted forward delta (A13).

---

## 4. Stage 2: Signal construction

All signals are computed **point in time**: the value on a date uses only data up to that date.

### 4.1 Hedge-ratio signals (how much to hedge)

The model supports one **momentum** signal and one **valuation** signal, blended with a configurable weight:

`combined signal = w × momentum + (1 − w) × valuation`

| Signal | Definition | Status | Open points |
|--------|------------|--------|-------------|
| **Valuation: volatility bounds** | EMA of nearby price over ~10 years ± 2 exponentially weighted standard deviations. The target contract's price is placed within the bounds: 100% at/below the lower bound (hedge more when cheap), 0% at/above the upper bound | Built, unvalidated | EMA is "span = 2520 days" by assumption. GS may have used a half-life (A11). Whether to score the target contract or the nearby price (A5, A12) |
| **Valuation: historical percentile** | Share of the last ~10 years of nearby prices at or below the target price. Signal = 1 minus that share | Built, unvalidated | Alternative valuation signal from the 24m deck. Window length assumed 10 years |
| **Momentum: RSI** | Wilder RSI, 40-day period, 5-day average, calculated on the nearby price, scaled 0 to 1 | Built, unvalidated | Wilder variant assumed (A4). GS validated that nearby-based RSI tracks target-contract RSI within ~2 points (see 5.2) |
| **Momentum: stochastic oscillator** | %K / %D on settlement prices (no high/low available) | Built with **placeholder** parameters | Deck gives no periods (A16). RSI and stochastic gave similar results at GS, which chose RSI |
| **Momentum: short-period vol bounds** | Same bounds idea over a shorter window | Built with **placeholder** parameters | Window and direction not stated (A16) |

**Signal weights.** Evidence is conflicting (A1):

| Source | Momentum weight |
|--------|-----------------|
| 24m deck (chosen model) | 50% RSI / 50% volatility bounds |
| Earlier 24m documentation | 25% / 75% |
| Sep 2026 48m spec | Valuation only (0%) |
| GS top-20 table | 25% or 50%, plus one valuation-only entry (rank 2) |

The weight is a parameter. The backtest will compare the options.

### 4.2 Hedge-ratio bounds (min and max hedge per months-to-exposure)

| Variant | Description | Status |
|---------|-------------|--------|
| **IV** | Minimum rises 6.25 percentage points a month from 24 to 9 months (equal to a linear buying schedule), reaching 100% at 9 months. No minimum beyond 24 months. Maximum 100% | Complete (table taken from the 48m spec) |
| **I** | No minimum, no maximum | Complete |
| **II, III, V** | Described only qualitatively ("low min / high max", etc.) | **Blocked**: numeric tables are not in the material we hold |

Bounds **V** is the one the 24m deck chose ("not forced to cover 24 months ahead"). Nine of the 20 GS top strategies use it, so this gap limits calibration.

The unexplained label **"Flex"** (e.g. "9m HR IV Flex") appears in every GS bounds name. We do not know what it changes.

**Target hedge ratio** = `min + combined signal × (max − min)`, rounded to the nearest 5%. For the incremental trade, the model takes target minus the current hedge. By default it **never sells down** an existing hedge (A14). GS's behaviour on falling signals is unconfirmed.

### 4.3 Toolbox signals (what to hedge with)

| Decision | Signal | Rule | Status |
|----------|--------|------|--------|
| Futures vs options | Percentile of the 15-month ATMF implied vol against the last 10 years | Futures share = minimum futures + (1 − minimum) × percentile. High vol (expensive options) gives more futures | Built, unvalidated |
| Beyond 24 months | n/a | 100% futures | Built |
| Calls vs collars | Percentile of the 25-delta risk reversal (call IV minus put IV) against the last 5 years | Below the 50th percentile: zero-cost collars. Otherwise: calls. Binary, never both | Built, unvalidated |
| Minimum futures share | n/a | 30% (48m spec) or 50% (24m deck and **all** top-20 strategies) | Parameter. Conflict to resolve (A2) |
| Rounding | Futures share rounded to the nearest 5%, remainder to the option leg | Meets the sum-to-100% constraint | Built. See note below |

**Rounding note.** The deck states a general rule (sum to 100%, ordering preserved) with an example across three numbers. Our implementation handles the two-leg case that the binary calls-or-collars rule produces. A full three-way routine is not built because the binary rule means at most two legs are ever non-zero.

### 4.4 Output
For each exposure month the model produces the GS-format row: inception date, exposure date, contract month, months to exposure, valuation signal, min/max hedge ratio, rounded target, current, incremental, IV percentile, futures fraction, skew percentile, instrument, rounded futures / options / collars %, and the incremental allocation per instrument. Incremental allocations (e.g. 5.25%, 9.75%) are **not rounded**.

### 4.5 Verification so far
- GS worked examples A (15m collars), B (15m calls) and C (30m futures only) are reproduced exactly from the stated inputs. These check the allocation arithmetic, **not** the signal calculations.
- 23 automated tests pass. They cover arithmetic, pricing round-trips, absence of look-ahead, and consistency between full time-series and single-date signal calculations.
- **Not yet verified:** that our signal values match GS's on real data.

---

## 5. Stage 3: Calibration and independent signal validation

### 5.1 Calibration tools

| Tool | Purpose | Status |
|------|---------|--------|
| **Top-20 targets file** | GS's 20 best strategies (price, volatility, trades per year) encoded as comparison targets, each convertible to a runnable configuration | Built. Rows 1–13 read with confidence. **Rows 14–20 were read from an image and need checking** |
| **Checkpoint tester** | Compares our valuation, IV percentile and skew percentile to GS's worked-example values on the example dates | Built. **Needs real data** |
| **Convention search** | Tries EMA span vs half-life, several lengths, target vs nearby pricing; ranks by error against the checkpoints | Built. **Needs real data** |
| **Parameter sweeps** | One parameter at a time (GS's method) and full-grid | Built. **Needs real data** |

### 5.2 Independent validation tests

| Test | What it checks | Pass criterion | Status |
|------|----------------|----------------|--------|
| **RSI proxy** | RSI on the nearby price vs RSI on each target contract's own prices | Mean absolute difference about 2 points; below 6 points on more than 95% of days (GS result) | Built. Needs per-contract price history |
| **Worked-example checkpoints** | Valuation 63.8% / 46.6% / 56.6%; IV percentile 72.6% / 10.3%; skew percentile 5.9% / 81.3% | Match within about a point or two | Built. Needs real data |
| **Signal behaviour tests** | Ranges, direction, no look-ahead | Pass | Complete on synthetic data |

### 5.3 What is not done, and why
- **No calibration has been run.** There is no real data.
- **Bounds V undefined**, so 9 of the 20 target strategies cannot be run.
- **Stochastic and short-bounds parameters** are placeholders.
- **Out-of-sample protection** (walk-forward or holdout testing) is not built. GS's own results are in-sample over one 10-year window selected from thousands of models, so this is recommended before we rely on any chosen parameters.

---

## 6. Stage 4: Backtesting

### 6.1 Simulation design
Each month, on or after the 15th, the model runs on data available that day. For every exposure month from 9 to 24 (or 48) months out, it decides the target hedge, trades the increment at that day's prices, and carries the position forward. Each exposure is settled at its target contract's final price at expiry.

| Instrument | Execution price | Final cost per unit of exposure |
|------------|-----------------|---------------------------------|
| Futures | Target contract price on the run date | The futures price paid |
| 25-delta or ATMF call | Black-76 premium | min(settle, strike) + premium |
| Zero-cost collar | 25-delta call bought; put strike solved so net premium is zero | Settle price clipped between put strike and call strike |
| Unhedged remainder | n/a | Settlement price (spot) |

### 6.2 Benchmarks (as used by GS)
Spot buying; 9-month rolling futures; linear buying (equal parts monthly from 24 to 9 months); 50% front-loaded then linear.

### 6.3 Metrics

| Metric | Our definition | Status |
|--------|----------------|--------|
| Average coverage price | Mean cost across all settled exposures | Built |
| YoY volatility | Standard deviation of 12-month changes in monthly coverage price | Built. **Interpretation**, to be confirmed (A15) |
| Trades per year | Executed instrument legs per year | Built. **Interpretation**, to be confirmed (A19) |
| Stability | Share of 24-month blocks in which the strategy beats 9m rolling futures | Built. **Interpretation**. GS used a points system we have not seen (A20) |
| Composite score | Rank-based points across price, volatility, stability | Built. Weights are ours, not GS's |

### 6.4 Backtest workstreams

| Workstream | Status | Notes |
|------------|--------|-------|
| Backtest individual signals | **Partly built** | Any signal can be run alone by setting its weight and the bounds. There is no dedicated one-signal report yet |
| Validate RSI proxy | Built | See 5.2 |
| Test combinations and weighting | Built | Full-grid sweep over momentum signal, valuation signal and weight |
| Stress test across regimes | Built | Default regimes: GFC 2008–09, recovery 2010–13, oil crash 2014–16, range 2017–19, COVID 2020, Ukraine spike 2022, post-spike 2023–25. Date ranges are approximate and editable |
| Compare to GS top-20 | Built | Reports rank correlation and gaps in price, volatility and trade counts. Absolute levels will differ if our data or period differ |

### 6.5 Known simplifications (affect backtest accuracy)
- **Option pricing:** a flat 15-month vol is applied to all tenors and strikes (A17). Real surfaces vary by strike and tenor.
- **No transaction costs or bid-ask spreads** (A18). With roughly 100 trades a year in GS's top strategies, this could matter, particularly for options and for long-dated futures.
- **No unwinds** (A14).
- **Contract rolls** are handled by contract month. Intraday timing and holidays are not modelled.
- **Synthetic runs** only prove the mechanics work. The sample numbers they produce mean nothing. On synthetic data we saw about 230 trades a year against GS's 111 for similar strategies. This may be a synthetic-data effect or a definition difference, and we flag it for checking on real data.

---

## 7. Stage 5: Integration into a production framework

| Component | Status | Notes |
|-----------|--------|-------|
| Monthly inception runner producing the GS-format table | Built, unvalidated | Run from the command line on a chosen date |
| State store (current hedge per exposure month) | Built | Saved as a JSON file. Needs a decision on the system of record |
| Configuration of all parameters | Complete | Single configuration object, plus presets |
| Reconciliation against actual GS monthly signals | **Not started** | Needs GS output files and the real data |
| Scheduling and automated data refresh | **Not started** | Depends on the LSEG pipeline |
| Audit trail (inputs, parameters, outputs per run) | **Not started** | Needs governance requirements |
| Approval workflow and handoff to execution | **Not started** | Operational process to be defined by the business |
| Monitoring for stale data or abnormal signals | **Not started** | Defined after real-data behaviour is known |
| Extension to other commodities (TTF, Henry Hub, NBP, Sugar 11) | **Not started** | Framework is generic, but each needs its own data and calibration |

---

## 8. Assumptions register

| ID | Assumption | Impact if wrong | Who can confirm |
|----|------------|-----------------|-----------------|
| A1 | Momentum weight: 0 / 25 / 50% candidates | Changes hedge ratios materially | GS / CPRM |
| A2 | Minimum futures share 30% vs 50% | Changes futures/options split | GS / CPRM |
| A3 | IV measured at 15-month ATMF | Shifts percentile readings | Stated in GS documents |
| A4 | Wilder RSI | Small RSI differences | GS |
| A5 / A12 | Target contract scored against nearby-derived bounds | Changes the signal per contract | GS |
| A6 | Risk reversal = call IV minus put IV | Flips calls vs collars | Check vendor convention |
| A7 | Futures share rounded first, remainder to options | Minor | GS |
| A8 / A22 | Contract month = exposure month + 2. Expiry = last business day of month −2 | Wrong contract priced | CPRM |
| A9 | Percentile = share of window at or below current, current included | Few points | GS |
| A10 | Run once a month at inception | Process design | Confirmed by workflow |
| A11 | EMA is span 2520 days (not half-life) | Shifts bounds and valuation signal | GS |
| A13 | Undiscounted forward delta | Shifts option strikes | LSEG / GS |
| A14 | Hedges never sold down | Differs if GS allows reductions | GS |
| A15, A19, A20 | Metric definitions (YoY vol, trades per year, stability) | Backtest ranking comparability | GS |
| A16 | Stochastic and short-bound parameters and direction | Only if those signals are used | GS |
| A17, A18 | Flat vol pricing; no costs | Overstates backtest quality | Internal decision |
| A21 | Top-20 rows 14–20 transcribed from an image; "Flex" undefined | Calibration targets | Business to check |

---

## 9. Decisions and information needed from the business

| # | Question | Why it matters |
|---|----------|----------------|
| 1 | Which model is the target: the 24m deck (50% momentum, 50% minimum futures) or the Sep 2026 spec (valuation only, 30% minimum futures)? Or should both be built as presets? | Defines what we calibrate against |
| 2 | Can GS or CPRM supply the numeric hedge-ratio bounds for II, III and V, and explain "Flex"? | Unblocks 9 of the top-20 strategies |
| 3 | Can we get the deck appendices (1, 3, 4, 5), especially stability scoring? | Lets us replicate GS's ranking method |
| 4 | What is the LSEG delivery format, contract naming and available history? Is constant-maturity vol available? | Unblocks Stage 1 |
| 5 | The deck mentions "5 contracts for Brent" in the 9–24 month range, but the range holds 16 monthly exposures. Are all months hedged or a subset? | Changes the output row count |
| 6 | Should the model ever reduce an existing hedge? | Affects state logic and trade counts |
| 7 | What stop/validation criteria does the business want before the model is used for live decisions (e.g. checkpoint tolerance, out-of-sample test)? | Defines "done" |
| 8 | Who owns the system of record for hedge ratios, approvals and audit? | Needed for Stage 5 |

---

## 10. Realistic expectations

- **Mechanics:** high confidence we can reproduce the logic. The worked examples already match.
- **GS's numbers:** we expect to land in the same range on price, volatility and trade count, with the same ordering of benchmarks. We do **not** expect exact matches, because of the open conventions above and differences between LSEG and GS's data.
- **Future performance:** GS's reported improvement (5.5–6.4% on price, 37–47% on volatility versus 9-month rolling futures) is in-sample over one 10-year window, selected from thousands of models. Expect live results to be weaker. Valuation-based signals can underperform in a structural price shift. Trading costs are not yet included.

---

## 11. Suggested next steps

1. Business answers questions 1, 2, 4 and 5 in Section 9.
2. On receiving any LSEG sample: run the data-quality report, then the worked-example checkpoints.
3. Build the LSEG adapter and, if needed, the chain-to-25-delta conversion.
4. Run the RSI proxy test and the top-20 comparison.
5. Add walk-forward testing and transaction costs before relying on any chosen parameters.
6. Define reconciliation, scheduling and audit requirements for production.
