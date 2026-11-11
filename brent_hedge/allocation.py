"""Toolbox logic: target HR and instrument split for one exposure month."""
from dataclasses import dataclass

from .config import ModelConfig
from .hr_bounds import get_bounds
from .signals import round_to_nearest


@dataclass
class Allocation:
    months_to_exposure: int
    valuation_signal: float
    combined_signal: float
    min_hr: float
    max_hr: float
    target_hr: float
    current_hr: float
    incremental_hr: float
    iv_percentile: float
    futures_fraction_raw: float
    skew_percentile: float
    instrument: str          # "FUTURES_ONLY" | "CALLS" | "COLLARS"
    futures_pct: float
    options_pct: float
    collars_pct: float
    incr_futures: float
    incr_options: float
    incr_collars: float


def allocate(months_to_exposure, valuation_sig, momentum_sig, iv_pct, skew_pct,
             current_hr, cfg: ModelConfig) -> Allocation:
    w = cfg.momentum_weight
    combined = w * momentum_sig + (1 - w) * valuation_sig

    min_hr, max_hr = get_bounds(months_to_exposure, cfg.hr_bounds_variant)
    target = round_to_nearest((min_hr + combined * (max_hr - min_hr)) * 100,
                              cfg.hr_rounding_pct) / 100
    incr = target - current_hr
    if cfg.ratchet_only:
        incr = max(incr, 0.0)

    fut_raw = cfg.min_futures_fraction + (1 - cfg.min_futures_fraction) * iv_pct / 100
    if months_to_exposure > cfg.options_tenor_cap_months:
        instrument, fut, opt, col = "FUTURES_ONLY", 1.0, 0.0, 0.0
        fut_raw = 1.0
    else:
        fut = round_to_nearest(fut_raw * 100, cfg.fraction_rounding_pct) / 100
        fut = min(max(fut, 0.0), 1.0)
        remaining = 1.0 - fut
        if cfg.allow_collars and skew_pct < cfg.skew_threshold_percentile:
            instrument, opt, col = "COLLARS", 0.0, remaining
        else:
            instrument, opt, col = "CALLS", remaining, 0.0

    return Allocation(
        months_to_exposure, valuation_sig, combined, min_hr, max_hr, target,
        current_hr, incr, iv_pct, fut_raw, skew_pct, instrument, fut, opt, col,
        incr * fut, incr * opt, incr * col,
    )
