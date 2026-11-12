
# Brent Dynamic Hedging Model — Build Specification

> **What this is:** A complete technical specification for building a Brent crude oil dynamic hedging model. Designed to be fed directly into an AI coding assistant. No source citations — just raw specs, formulas, tables, and assumptions.
>
> **What this model does:** Determines how much to hedge, when to hedge, and with which instruments (futures, 25-delta calls, or zero-cost 25-delta collars) for each forward Brent crude exposure month. It runs once per month at inception and produces incremental hedge instructions.
>
> **Output format:** Must match the Goldman Sachs signal delivery format — per-exposure-month rows showing target hedge ratio, incremental hedge ratio, and instrument breakdown (futures %, options %, collars %).

---

## CONFIGURATION (all values must be parameterised)

```yaml
model_config:
  # Time frame
  min_tenor_months: 9
  max_tenor_months: 48

  # Signal 1: Valuation (Volatility Bounds)
  valuation_ema_lookback_years: 10        # ~2520 trading days
  valuation_k_std_devs: 2
  valuation_basis: "nearby_future"         # ASSUMPTION — see A5

  # Signal 2: Momentum (RSI) — NOT USED in final 48m model
  # Retained as configurable for testing / future use
  rsi_period_days: 40
  rsi_smoothing_days: 5
  rsi_basis: "nearby_future"               # ASSUMPTION — see A4

  # Combined signal weighting
  # ASSUMPTION A1: The Sep 2026 48m model uses Valuation Bounds ONLY (no RSI).
  # The worked example document shows only Valuation Signal feeding the hedge ratio.
  # However, earlier 24m documentation used 25% RSI / 75% Vol Bounds.
  # Set momentum_weight to 0.0 for pure valuation; 0.25 for blended.
  momentum_weight: 0.0                     # ASSUMPTION — see A1

  # HR Bounds
  hr_bounds_variant: "IV"                  # 48-to-9-month HR Bounds IV
  rounding_increment: 5                    # Round target HR to nearest 5%

  # Signal 3: Instrument selection (Futures vs Options)
  iv_metric: "15m_atmf_implied_vol"        # 15-month ATMF implied volatility
  iv_percentile_lookback_years: 10
  min_futures_hedge_fraction: 0.30         # ASSUMPTION — see A2
  options_tenor_cap_months: 24             # Beyond 24m, 100% futures

  # Signal 4: Calls vs Collars
  skew_metric: "25d_risk_reversal"         # 25-delta call IV minus 25-delta put IV
  skew_percentile_lookback_years: 5
  skew_threshold_percentile: 50            # Binary: below = collars, above = calls

  # Instrument specs
  option_delta: 25                         # 25-delta OTM
  collar_type: "zero_cost_25d"             # Buy 25-delta call, solve for put at zero premium

  # Rounding
  hedge_fraction_rounding: 5              # Round instrument fractions to nearest 5%
```

---

## HR BOUNDS IV — COMPLETE LOOKUP TABLE

This is the exact min/max hedge ratio schedule per months-to-exposure. The minimum increases by 6.25 percentage points per month from 24m to 9m. Beyond 24m, no minimum.

```
months_to_exposure | min_hr  | max_hr
-------------------|---------|-------
48                 |  0.00%  | 100.00%
47                 |  0.00%  | 100.00%
46                 |  0.00%  | 100.00%
45                 |  0.00%  | 100.00%
44                 |  0.00%  | 100.00%
43                 |  0.00%  | 100.00%
42                 |  0.00%  | 100.00%
41                 |  0.00%  | 100.00%
40                 |  0.00%  | 100.00%
39                 |  0.00%  | 100.00%
38                 |  0.00%  | 100.00%
37                 |  0.00%  | 100.00%
36                 |  0.00%  | 100.00%
35                 |  0.00%  | 100.00%
34                 |  0.00%  | 100.00%
33                 |  0.00%  | 100.00%
32                 |  0.00%  | 100.00%
31                 |  0.00%  | 100.00%
30                 |  0.00%  | 100.00%
29                 |  0.00%  | 100.00%
28                 |  0.00%  | 100.00%
27                 |  0.00%  | 100.00%
26                 |  0.00%  | 100.00%
25                 |  0.00%  | 100.00%
24                 |  6.25%  | 100.00%
23                 | 12.50%  | 100.00%
22                 | 18.75%  | 100.00%
21                 | 25.00%  | 100.00%
20                 | 31.25%  | 100.00%
19                 | 37.50%  | 100.00%
18                 | 43.75%  | 100.00%
17                 | 50.00%  | 100.00%
16                 | 56.25%  | 100.00%
15                 | 62.50%  | 100.00%
14                 | 68.75%  | 100.00%
13                 | 75.00%  | 100.00%
12                 | 81.25%  | 100.00%
11                 | 87.50%  | 100.00%
10                 | 93.75%  | 100.00%
9                  | 100.00% | 100.00%
```

---

## SIGNAL CALCULATIONS

### Signal 1: Valuation Bounds (primary hedge ratio driver)

Determines how much to hedge. Given short exposure (we are buying oil), hedge more when price is low (expected to mean-revert higher).

```
INPUT:
  - target_future_price: price of the futures contract matching the exposure month
  - nearby_future_prices: 10+ years of daily nearby future prices

CALCULATE:
  ema = exponential_moving_average(nearby_future_prices, span=2520)  # 10y × 252 days
  ema_std = exponential_moving_std(nearby_future_prices, span=2520)
  upper_bound = ema + 2 * ema_std
  lower_bound = ema - 2 * ema_std

  # Linear interpolation: 100% signal at lower bound, 0% at upper bound
  # (Short exposure: low price = hedge more)
  valuation_signal = (upper_bound - target_future_price) / (upper_bound - lower_bound)
  valuation_signal = clip(valuation_signal, 0.0, 1.0)

OUTPUT:
  valuation_signal  # float 0.0–1.0 (multiply by 100 for percentage)
```

**Key behaviour:**
- Price at or below lower bound → signal = 100% → hedge maximum
- Price at EMA → signal ≈ 50%
- Price at or above upper bound → signal = 0% → hedge minimum

### Signal 2: RSI (momentum — optional, may not be used in final model)

```
INPUT:
  - spot_prices: daily nearby future prices

CALCULATE:
  delta = diff(spot_prices)
  gains = max(delta, 0)
  losses = abs(min(delta, 0))
  avg_gain = wilder_smoothing(gains, period=40)  # ASSUMPTION A4: standard Wilder RSI
  avg_loss = wilder_smoothing(losses, period=40)
  rs = avg_gain / avg_loss
  rsi_raw = 100 - (100 / (1 + rs))
  rsi_smoothed = simple_moving_average(rsi_raw, window=5)

OUTPUT:
  rsi_signal = rsi_smoothed / 100  # float 0.0–1.0
```

### Combined Hedge Ratio Signal

```
combined_signal = (momentum_weight * rsi_signal) + ((1 - momentum_weight) * valuation_signal)

# If momentum_weight = 0.0, this simplifies to just valuation_signal
```

### Applying HR Bounds to get Target Hedge Ratio

For each exposure month, look up the months_to_exposure in the HR Bounds IV table:

```
min_hr = HR_BOUNDS_IV[months_to_exposure].min_hr
max_hr = HR_BOUNDS_IV[months_to_exposure].max_hr

target_hr = min_hr + combined_signal * (max_hr - min_hr)
target_hr = round_to_nearest(target_hr, 5)  # Round to nearest 5%
```

### Incremental Hedge Ratio

```
incremental_hr = target_hr - current_hedge_ratio
# current_hedge_ratio is the existing hedge already in place for this exposure month
```

---

### Signal 3: Historical Volatility Percentile → Futures vs Options split

```
INPUT:
  - iv_15m_series: 10+ years of daily 15-month ATMF implied volatility

CALCULATE:
  current_iv = iv_15m_series[-1]
  iv_percentile = percentile_rank(current_iv, iv_15m_series[-2520:])  # 10y window, 0–100

  futures_fraction = min_futures_hf + (1 - min_futures_hf) * (iv_percentile / 100)
  options_fraction = 1 - futures_fraction

  # OVERRIDE: If months_to_exposure > 24, force 100% futures / 0% options
  if months_to_exposure > 24:
      futures_fraction = 1.0
      options_fraction = 0.0

OUTPUT:
  futures_fraction  # float, e.g. 0.30–1.00
  options_fraction  # float, e.g. 0.00–0.70
```

**Key behaviour:**
- IV at 0th percentile (options cheap) → futures = 30%, options = 70%
- IV at 100th percentile (options expensive) → futures = 100%, options = 0%
- Beyond 24 months tenor → always 100% futures

### Signal 4: Volatility Skew → Calls vs Collars (binary)

```
INPUT:
  - rr_series: 5+ years of daily 25-delta risk reversal (call IV minus put IV)

CALCULATE:
  current_rr = rr_series[-1]
  skew_percentile = percentile_rank(current_rr, rr_series[-1260:])  # 5y window, 0–100

  # Binary signal
  if skew_percentile < 50:
      # Puts are cheap → zero-cost collars are attractive (good collar participation)
      instrument = "COLLARS"
  else:
      # Puts are expensive → buy calls outright
      instrument = "CALLS"

OUTPUT:
  instrument  # "CALLS" or "COLLARS"
```

---

## FINAL ALLOCATION — TOOLBOX LOGIC

For each exposure month, at each monthly inception:

```
STEP 1: Calculate target hedge ratio
  combined_signal = valuation_signal  # (or blended with RSI if momentum_weight > 0)
  min_hr, max_hr = HR_BOUNDS_IV[months_to_exposure]
  target_hr = round_to_nearest(min_hr + combined_signal * (max_hr - min_hr), 5)
  incremental_hr = target_hr - current_hedge_ratio

STEP 2: Calculate instrument fractions
  IF months_to_exposure > 24:
      futures_fraction = 100%
      options_fraction = 0%
      collars_fraction = 0%
  ELSE:
      futures_fraction = min_futures_hf + (1 - min_futures_hf) * (iv_percentile / 100)
      options_fraction = 1 - futures_fraction

      IF skew_percentile < 50:
          calls_fraction = 0%
          collars_fraction = options_fraction
      ELSE:
          calls_fraction = options_fraction
          collars_fraction = 0%

  # Round all fractions to nearest 5%
  futures_fraction = round_to_nearest(futures_fraction, 5)
  # Recalculate options/collars to ensure they sum to 100%
  remaining = 100% - futures_fraction
  IF instrument == "CALLS":
      calls_fraction = remaining
      collars_fraction = 0%
  ELSE:
      calls_fraction = 0%
      collars_fraction = remaining

STEP 3: Calculate incremental notional per instrument
  incremental_futures  = incremental_hr * futures_fraction
  incremental_calls    = incremental_hr * calls_fraction
  incremental_collars  = incremental_hr * collars_fraction
```

---

## OUTPUT FORMAT

The model must produce output matching the GS signal delivery format. Each monthly run produces one row per exposure month:

```
| Inception Date | Exposure Date | Contract Month | Months to Exposure | Valuation Signal | Min HR | Max HR | Rounded Target HR | Current HR | Incremental HR | IV Percentile | Futures Fraction | Skew Percentile | Instrument | Rounded Futures % | Rounded Options % | Rounded Collars % | Incr Futures | Incr Options | Incr Collars |
```

### Worked Example A (15-month tenor)

```
Inception:        15 Jan 2021
Exposure:         15 Apr 2022 (June 2022 contract)
Months to Exp:    15
Min HR (Bounds IV): 62.50%
Max HR:           100.00%

Valuation Signal: 63.8%
Target HR:        62.5% + 63.8% × (100% - 62.5%) = 86.4% → rounded to 85%
Current HR:       60% (illustrative)
Incremental HR:   85% - 60% = 25%

IV Percentile:    72.6% (high → options expensive → more futures)
Futures Fraction: 30% + (100% - 30%) × 72.6% = 80.8% → rounded to 80%
Options Fraction: 100% - 80% = 20%

Skew Percentile:  5.9% (low → puts cheap → collars)
Instrument:       COLLARS (5.9% < 50%)

Final Instrument Split:
  Futures:  80%
  Options:  0%
  Collars:  20%

Incremental Allocation:
  Futures:  80% × 25% = 20.0%
  Options:  0% × 25% = 0.0%
  Collars:  20% × 25% = 5.0%
```

### Worked Example B (15-month tenor, different market conditions)

```
Inception:        15 Jul 2024
Exposure:         15 Oct 2025 (December 2025 contract)
Months to Exp:    15
Min HR (Bounds IV): 62.50%
Max HR:           100.00%

Valuation Signal: 46.6%
Target HR:        62.5% + 46.6% × (100% - 62.5%) = 80.0% → rounded to 80%
Current HR:       65% (illustrative)
Incremental HR:   80% - 65% = 15%

IV Percentile:    10.3% (low → options cheap → fewer futures)
Futures Fraction: 30% + (100% - 30%) × 10.3% = 37.2% → rounded to 35%
Options Fraction: 100% - 35% = 65%

Skew Percentile:  81.3% (high → puts expensive → calls)
Instrument:       CALLS (81.3% > 50%)

Final Instrument Split:
  Futures:  35%
  Options:  65%
  Collars:  0%

Incremental Allocation:
  Futures:  35% × 15% = 5.3%
  Options:  65% × 15% = 9.8%
  Collars:  0% × 15% = 0.0%
```

### Worked Example C (30-month tenor — beyond options cap)

```
Inception:        15 Apr 2021
Exposure:         15 Oct 2023 (December 2023 contract)
Months to Exp:    30
Min HR (Bounds IV): 0.00%
Max HR:           100.00%

Valuation Signal: 56.6%
Target HR:        0% + 56.6% × (100% - 0%) = 56.6% → rounded to 55%
Current HR:       40% (illustrative)
Incremental HR:   55% - 40% = 15%

Tenor > 24 months → 100% FUTURES (no options allowed)

Final Instrument Split:
  Futures:  100%
  Options:  0%
  Collars:  0%

Incremental Allocation:
  Futures:  100% × 15% = 15.0%
  Options:  0%
  Collars:  0%
```

---

## DATA REQUIREMENTS

### Daily market data feeds (via API or vendor)

```
1. Brent ICE Futures — nearby contract daily settlement
2. Brent ICE Futures — full forward curve (monthly contracts out to 48 months)
3. 15-month ATMF Implied Volatility (daily)
4. 25-delta Call Implied Volatility, 15-month tenor (daily)
5. 25-delta Put Implied Volatility, 15-month tenor (daily)
```

### Derived fields (calculated internally)

```
1. 10-year EMA of nearby future price
2. 10-year exponential standard deviation of nearby future price
3. Upper Valuation Bound = EMA + 2σ
4. Lower Valuation Bound = EMA - 2σ
5. Valuation Signal = (Upper - Price) / (Upper - Lower), clipped [0,1]
6. RSI (40d, 5d smoothed) — if momentum_weight > 0
7. 10-year percentile rank of current 15m ATMF IV
8. 25-delta Risk Reversal = 25d Call IV - 25d Put IV
9. 5-year percentile rank of current Risk Reversal
```

### Historical data needed for initialisation

```
- Nearby future prices: 10+ years
- 15m ATMF Implied Volatility: 10+ years
- 25-delta Risk Reversal: 5+ years
```

---

## ASSUMPTIONS LOG

Every assumption is flagged so the team can review and correct. The model should be built so each of these is a configurable parameter, not hardcoded.

### A1 — Combined signal: Valuation only vs. blended with RSI
**Assumed:** The 48-month model uses Valuation Bounds only (momentum_weight = 0.0). The September 2026 worked example document shows only "Valuation Signal" feeding the hedge ratio with no RSI component. Earlier 24-month documentation used 25% RSI / 75% Vol Bounds. The regional deck references "Buying Signal: Volatility Bounds" for the 48m model.
**Impact if wrong:** If RSI should be included, set momentum_weight to 0.25 and the combined signal becomes a weighted blend.
**Action:** Confirm with GS or CPRM whether the final 48m model includes RSI at all.

### A2 — Minimum futures hedge fraction: 30% vs 50%
**Assumed:** 30%. The September 2026 worked example document explicitly uses 30% in all three worked examples (formula shown: "30% + (100% - 30%) × Signal"). Earlier 24-month documentation used 50%.
**Impact if wrong:** Changes the futures/options split range. At 50% min, options can never exceed 50% of the hedge. At 30% min, options can reach up to 70%.
**Action:** This appears resolved by the Sep 2026 document, but confirm with CPRM.

### A3 — IV metric tenor: 15-month ATMF
**Assumed:** 15-month ATMF implied volatility. The worked example document explicitly labels the chart "15m ATMF Implied Volatility" and defines it as "the at-the-money-forward implied volatility of the future contract with expiry in 15 months and a contract month that is 2 months after that."
**Impact if wrong:** Different tenor IV would shift the percentile readings.
**Action:** Low risk — this is explicitly stated.

### A4 — RSI formula: standard Wilder RSI
**Assumed:** Standard Wilder RSI with exponential smoothing. No GS document specifies the exact RSI variant.
**Impact if wrong:** Different RSI implementations (e.g., Cutler's RSI using SMA instead of EMA) would produce slightly different values.
**Action:** If RSI is used (see A1), confirm the exact variant with GS.

### A5 — Valuation Bounds basis: nearby future vs target contract
**Assumed:** The EMA and bounds are calculated on the nearby future price. The valuation signal is then applied by comparing the target contract price (the specific forward month matching the exposure) against those nearby-derived bounds.
**Impact if wrong:** If bounds should be calculated per-contract-month, the computation is significantly more complex.
**Action:** The worked example chart is labelled "Brent Crude Nearby Future Price" for the EMA/bounds, with separate lines for "15m Future Price" and "30m Future Price" compared against them. This supports the assumption.

### A6 — Risk Reversal convention: call IV minus put IV
**Assumed:** Risk Reversal = 25-delta call IV − 25-delta put IV. The worked example states: "implied vol skew, defined as the difference between the 25-Delta call and the 25-Delta put."
**Impact if wrong:** If the convention is reversed (put − call), the binary signal flips.
**Action:** Low risk — explicitly defined. But confirm vendor data convention matches.

### A7 — Rounding constraints
**Assumed:** When rounding instrument hedge fractions to nearest 5%: (1) total must still sum to 100%, (2) ordering must be preserved. Futures fraction is rounded first, remainder allocated to options or collars.
**Impact if wrong:** Minor — affects trade count, not strategy direction.
**Action:** Low priority.

### A8 — Contract month convention
**Assumed:** "Target contract" = the futures contract expiring in the exposure month, with a contract month two months after the exposure. E.g., April 2022 exposure → June 2022 contract.
**Impact if wrong:** Would shift which contract is being priced and hedged.
**Action:** Confirm with CPRM the exact contract-to-exposure mapping used.

### A9 — Percentile calculation method
**Assumed:** Simple rolling rank percentile: count of historical values ≤ current value, divided by total count, × 100.
**Impact if wrong:** Different percentile methods (e.g., interpolated, exclusive) would shift readings by a few points.
**Action:** Low priority — unlikely to materially change signals.

### A10 — Execution frequency
**Assumed:** Model runs once per month at inception (beginning of month). GS sends the signal monthly.
**Impact if wrong:** If the model should run daily or weekly, the data pipeline and state management change significantly.
**Action:** Confirmed by operational workflow — monthly inception.

---

## ARCHITECTURE NOTES

### State management
The model is stateful — it needs to know the `current_hedge_ratio` for each exposure month. This must be stored and updated after each execution cycle.

### Per-contract independence
Each exposure month (9–48 months forward) is evaluated independently. The valuation signal is the same for all contracts (based on nearby price vs bounds), but the HR Bounds min/max differ per months-to-exposure.

### Data pipeline
```
[Vendor API] → [Daily price ingestion] → [Signal calculation engine] → [Monthly inception run]
                                                                              ↓
                                                                    [Output: incremental hedge instructions per exposure month]
                                                                              ↓
                                                                    [State update: new current_hedge_ratio per exposure month]
```

### Extensibility
This framework is designed to be applied to other commodities with different parameters:
- Nat Gas TTF: 48 months
- Nat Gas Henry Hub NYMEX: 48 months
- Nat Gas NBP (UK): 36 months
- Sugar 11: 36 months

Each commodity will have its own backtested config values but the same toolbox logic.

---

## ADDITIONAL ASSUMPTIONS (post-review)

### A11 — EMA parameterisation: span vs halflife
**Assumed:** `span=2520` (alpha ≈ 0.000794). GS says "10-year EMA" without specifying. `halflife=2520` (alpha ≈ 0.000275) would decay more slowly. Configurable via `ema_mode` and `ema_length_days`. **Action:** confirm with GS.

### A8 (extended) — Roll rule
Contract month = exposure month + `contract_month_offset` (2). The roll rule (calendar vs ICE expiry) is a CPRM operational detail and is not modelled. Curve prices are looked up by contract month on the inception date.

### A9 (clarified)
The current value is included in the percentile sample before ranking.

### A12 — Valuation signal per contract
The architecture note says one signal for all contracts, while A5 says each target contract's price is compared with the nearby-derived bounds. Implemented per A5 via `valuation_use_target_contract` (set False for one common signal).

### Rounding
Rounding applies to target HR and instrument fractions only. Incremental allocations (incremental HR × fraction) stay unrounded.

### A13 — Delta convention
Undiscounted forward delta (call = N(d1)). Confirm against LSEG's 25-delta convention (premium-adjusted / discounted deltas shift strikes).

### A14 — Hedge unwinds
`ratchet_only=True`: incremental HR is floored at 0 (hedges are never sold down when the signal falls). The GS output may allow negative increments; unwinds are not modelled in the backtest.

### A15 / A19 / A20 — Backtest metric definitions (interpretations)
YoY vol = std of 12-month changes in monthly coverage price (USD). Trades/yr = executed legs per year of monthly runs. Stability = share of 24-exposure-month blocks where the strategy beats the 9m rolling futures benchmark. GS's exact definitions (and stability points) are unknown.

### A16 — Short vol bounds / stochastic as momentum
Deck gives no periods or direction. Placeholders: stochastic %K 40d / %D 5d on settlement prices; short bounds EMA 252d, high price = high signal.

### A17 / A18 — Option pricing in the backtest
Flat 15m vols per instrument family for all strikes/tenors (ATMF vol for ATM, 25d call vol for 25d call, 25d put vol for the collar put); Black-76, r=0, mid prices, no transaction costs. To be replaced with chain-derived vols.

### A21 — Rows 14-20 of the top-20 table
Read from an image; marked confidence=low in `calibration/targets_top20.csv`. "Flex" in the GS bounds labels is undefined and ignored. Bounds II, III and V are not defined yet (register with `hr_bounds.register_bounds_csv`).

### A22 — Contract expiry
Contract month M expires on the last business day of month M-2 (holidays not modelled). Final settlement = last observed price of the contract.
