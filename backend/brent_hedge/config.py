"""Model configuration. Every assumption in the spec is a parameter here."""
from dataclasses import dataclass


@dataclass
class ModelConfig:
    # Tenor range (24m deck model: 9..24; Sep 2026 model: 9..48)
    min_tenor_months: int = 9
    max_tenor_months: int = 48

    # ---- HR signal selection --------------------------------------------
    # momentum: "rsi" | "stochastic" | "vb_short" | None
    # valuation: "vol_bounds" | "hist_percentile"
    momentum_signal: str = "rsi"
    valuation_signal: str = "vol_bounds"
    momentum_weight: float = 0.0           # A1: 0.0 / 0.25 / 0.50 candidates

    # Valuation: vol bounds
    # A11: GS says "10-year EMA" but not span vs halflife. Default span.
    ema_mode: str = "span"                 # "span" | "halflife"
    ema_length_days: int = 2520            # 10y x 252
    k_std_devs: float = 2.0
    # A5: True = compare each target contract's price to nearby-derived bounds.
    valuation_use_target_contract: bool = True
    # Valuation: historical percentile of price (window of nearby prices)
    hist_percentile_lookback_days: int = 2520

    # Momentum params (placeholders: not given in deck)
    rsi_period_days: int = 40
    rsi_smoothing_days: int = 5
    stoch_k_days: int = 40                 # PLACEHOLDER
    stoch_d_days: int = 5                  # PLACEHOLDER
    vb_short_ema_days: int = 252           # PLACEHOLDER (short-period bounds)

    # HR bounds: "I", "IV" built in; "V"/"II"/"III" need register_bounds()
    hr_bounds_variant: str = "IV"
    hr_rounding_pct: float = 5.0
    ratchet_only: bool = True              # A14: never sell down an existing hedge

    # ---- Toolbox ----------------------------------------------------------
    iv_lookback_days: int = 2520
    min_futures_fraction: float = 0.30     # A2: deck top-20 all use 0.50
    options_tenor_cap_months: int = 24
    option_type: str = "25d"               # "25d" | "atmf" (backtest pricing)
    allow_collars: bool = True
    skew_lookback_days: int = 1260
    # A6: "call_minus_put" (default) or "put_minus_call". Resolve with the
    # worked-example checkpoints once real data is available.
    rr_convention: str = "call_minus_put"
    skew_threshold_percentile: float = 50.0
    fraction_rounding_pct: float = 5.0

    # A8: contract month = exposure month + offset
    contract_month_offset: int = 2

    # ---- Backtest ---------------------------------------------------------
    inception_day: int = 15                # monthly run on/after this day
    warmup_days: int = 756                 # min history before first run
