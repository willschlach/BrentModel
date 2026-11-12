# Brent Hedging Model: Web Application Design Spec

**Status:** Draft v1, 10 Nov 2026
**Scope of this document:** what the application shows, what its numbers mean, how recommendations are handled, how data flows, and what is built in the first version.

---

## 1. Purpose and users

The application presents the output of the Brent dynamic hedging model so that a treasury user can answer five questions:

1. What should we do this month?
2. Why does the model say that?
3. Where do we stand overall?
4. Can we trust the model?
5. Is the underlying data healthy?

**Primary user (assumed):** treasury staff who review the monthly signal and place hedges.
**Secondary user (assumed):** management and risk, who review performance and model validity.
Audience is an open decision (see Section 11). The v1 design serves the primary user.

---

## 2. Principles

- **The model's output is shown exactly as produced.** Nothing is blended into it or hidden.
- **Advice is separated from checks.** The app gives a model instruction, then automated flags with the rule that raised each one. It does not give discretionary market views.
- **Every number can be explained.** Each target hedge shows how much comes from the minimum schedule and how much from the signal.
- **Synthetic or unvalidated data is always labelled.** A visible banner appears whenever data is not from a validated live source.
- **Performance figures carry their caveats.** Backtest numbers are in-sample and exclude trading costs.
- **Accessible by default.** Keyboard navigation, text alternatives for charts (a data table beside each chart), and colour is never the only signal.

---

## 3. What the output means

| Term | Meaning |
|------|---------|
| Exposure month | A future month in which Brent is bought (9 to 48 months out) |
| Contract month | The futures contract hedging it: exposure month + 2 |
| Current HR | Hedge ratio already in place, as a percent of expected exposure volume |
| Target HR | Hedge ratio the model wants, rounded to 5% |
| Incremental HR | Target minus current. Never negative by default (no unwinds) |
| Schedule-driven part | The minimum hedge ratio mandated by the bounds schedule for that tenor |
| Signal-driven part | Target minus the schedule-driven part |
| Futures / options / collars % | Split of the target by instrument, rounded to 5% |
| Incremental allocation | Incremental HR × instrument share. Left unrounded, as in the GS format |

Important consequences for how numbers are read:

- Hedge ratios are **percent of exposure volume**, not barrels. Converting to lots needs a monthly volume per exposure month (not yet available).
- Close to 9 months, most of the target is schedule-driven. A target of 85% there does not mean strong conviction.
- The calls-or-collars choice is binary, so a small change in the skew percentile near 50 can flip it. The app flags this.
- **Current HR should come from executed hedges, not the previous target.** The current prototype stores targets; v2 must store executions (Section 7).

---

## 4. Information architecture

| # | View | Answers | v1 |
|---|------|---------|----|
| 1 | Monthly decision | What should we do? | Yes |
| 2 | Why (signal drivers) | Why? | Yes |
| 3 | Position and coverage | Where do we stand? | No (needs executions) |
| 4 | Performance (backtest) | Does it work? | No (needs real data) |
| 5 | Validation | Can we trust it? | No (needs real data) |
| 6 | Data and audit | Is the data healthy? Which assumptions are open? | Yes |

### 4.1 Monthly decision
- **Summary strip:** run date, data as-of date, data source, number of exposure months with trades, average current and target HR, total incremental by instrument.
- **Flags panel:** all raised flags, sorted by severity, each showing the rule that triggered it.
- **Ladder chart:** x = months to exposure (9 to 48). Shows the min–max band, current HR, target HR. The gap is the trade.
- **Instrument chart:** stacked bars of incremental futures, options, collars per exposure month.
- **Decision table:** the GS-format row set, sortable, with CSV export. Expandable row showing the schedule/signal split and the inputs behind the row.

### 4.2 Why
- **Valuation chart:** nearby price, EMA, upper and lower bound, with target-contract prices (for example the 15- and 30-month contracts) marked against the bounds.
- **Implied vol chart:** 15-month ATMF history, current value, percentile, and the resulting futures share.
- **Skew chart:** 25-delta risk reversal history, the 50th-percentile threshold, current value, and the resulting instrument (calls or collars).
- **Plain-language line per signal**, generated from the numbers (for example "options are cheap relative to history, so 35% futures").
- **Momentum panel** appears only when the momentum weight is above zero.

### 4.6 Data and audit
- Data source, last data date, per-series history length and gaps.
- Config used for the run (preset, key parameters).
- Assumptions register with status: confirmed, assumed, or placeholder.

### 4.3 to 4.5 (later)
- **Position:** hedged % by exposure month and instrument, average locked price, premium spent, collar strikes, mark-to-market. Needs executions and curve data.
- **Performance:** cost versus the four benchmarks, YoY volatility, stability blocks, regimes. Needs the backtest run on real data.
- **Validation:** checkpoint errors versus GS worked examples, RSI-proxy distribution, top-20 comparison, parameter sensitivity.

---

## 5. Recommendations and flags

Three layers, never merged:

1. **Model instruction.** The GS-format output.
2. **Flags.** Automated checks with transparent rules (below).
3. **Human decision.** Approve, adjust or reject each line, with a reason. Recommended versus executed is stored (v2).

### 5.1 Flag rules (v1)

| ID | Severity | Rule |
|----|----------|------|
| DATA_SYNTHETIC | critical | Data source is synthetic |
| DATA_STALE | critical | Last data date is more than 3 calendar days before the run date |
| SKEW_NEAR_THRESHOLD | warn | Skew percentile within 5 points of the threshold (50): the calls/collars choice could flip |
| IV_NEAR_ROUNDING | info | Raw futures share within 0.5 points of a 5% rounding boundary |
| TARGET_NEAR_ROUNDING | info | Raw target HR within 0.5 points of a rounding boundary |
| SCHEDULE_DRIVEN | info | Exposure month where the schedule minimum is at least 80% of the target |
| SIGNAL_AT_EXTREME | info | Valuation signal clipped at 0% or 100% (price outside bounds) |
| LARGE_INCREMENT | warn | Incremental HR of 20 points or more in a single month |
| LONG_DATED | info | Exposure more than 36 months out (thin liquidity, futures only) |

Thresholds are configuration, not hard-coded. The rules live in the Python package, so the same flags appear in CLI output and the app.

### 5.2 Explicitly out of scope
- Directional or discretionary views ("oil looks cheap").
- Execution advice such as timing or venue.
- Indicative strikes and premiums are deferred until option pricing is based on real vol data. They will be labelled indicative.

---

## 6. Data contract (v1)

The backend produces one JSON document per run. The frontend reads it through a single data-access module, so swapping a static file for a live API changes one file.

```
RunSnapshot {
  schemaVersion: 1
  meta: { runDate, lastDataDate, generatedAt, dataSource, preset, config{...} }
  summary: { exposures, withTrades, avgCurrentHr, avgTargetHr,
             incrementalByInstrument{ futures, options, collars } }
  rows: [ { exposureDate, contractMonth, monthsToExposure, valuationSignal,
            minHr, maxHr, targetHr, currentHr, incrementalHr,
            ivPercentile, futuresFractionRaw, skewPercentile, instrument,
            futuresPct, optionsPct, collarsPct,
            incrFutures, incrOptions, incrCollars, contractPrice } ]
  signals: { price[{date, nearby, ema, upper, lower}],
             targets[{label, contractMonth, price}],
             iv{ series, current, percentile, lookbackYears },
             rr{ series, current, percentile, threshold, lookbackYears },
             momentum{ weight } }
  flags: [ { id, severity, scope, message } ]
  dataHealth: { ...per-series quality }
  assumptions: [ { id, text, status } ]
}
```

HR values are fractions (0.85 = 85%). Dates are ISO strings.

---

## 7. State and executions (v2 design note)

- `executions`: exposure month, date, instrument, size, price/strike, premium, source (model or manual).
- Current HR for the next run is derived from executions.
- `approvals`: per recommendation line, status (approved, adjusted, rejected), user, reason, timestamp.
- Each run stores its input snapshot and config so any past recommendation can be reproduced.

---

## 8. Architecture

```
Python package (existing)  ->  export / API layer  ->  React app
  signals, allocation,         v1: static JSON         Vite + React + TypeScript
  backtest, flags              v2: FastAPI + DB        routing, charts, tables
```

- **v1:** the Python export script writes `frontend/public/data/latest.json` (git-ignored, not committed). The app is static and shows "No run data yet" when the file is absent. Moving run data behind Supabase row level security is planned after the sign-in change (see `docs/Auth_and_Roles.md`).
- **v2:** a small API service serves runs, history and, later, executions/approvals, backed by a database.
- Monthly run is a scheduled job. The app never recomputes the model in the browser.

### Frontend stack
- Vite, React, TypeScript (strict), React Router.
- Recharts for charts. Plain CSS (no UI framework) to keep dependencies small.
- Dependencies pinned to exact versions.

---

## 9. Security and confidentiality

- The repository is public. **Vendor-licensed data and GS source material must not be committed.** The v1 sample JSON is synthetic.
- Real runs must be served from an internal host with authentication (decision needed on hosting and SSO).
- The app is read-only in v1: no write paths, no secrets in the frontend.

---

## 10. Delivery plan

| Phase | Content | Status |
|-------|---------|--------|
| 0 | This spec | Done |
| 1 | Python: flags + snapshot export on synthetic data | Built with this spec |
| 2 | Vite app: views 1, 2, 6 on the snapshot | Built with this spec |
| 3 | Real data via LSEG adapter; remove synthetic banner | Blocked on LSEG data |
| 4 | Views 4 and 5 (needs real-data backtest) | Blocked on Phase 3 |
| 5 | API, database, executions, approvals, view 3 | Not started; needs decisions below |
| 6 | Hosting, authentication, scheduled runs | Not started |

---

## 11. Open decisions

1. Primary audience: executing treasury staff, or management review?
2. Are exposure volumes by month available (to show lots/barrels)?
3. Should the app track executions and approvals (v2), or only display output?
4. Hosting and authentication requirements for the internal deployment?
5. Flag thresholds in Section 5.1: do they match how the team would judge a signal as fragile?
