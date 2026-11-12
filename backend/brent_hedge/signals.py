"""Signal calculations.

Two layers:
  *_series functions return full time series (point-in-time, no look-ahead:
  value at t uses data up to and including t only). Used for calibration,
  validation and backtests.
  Scalar functions return the latest value (used by the monthly run).
"""
import math

import numpy as np
import pandas as pd

from .config import ModelConfig


def round_to_nearest(x: float, increment: float) -> float:
    """Round half up (avoids Python's banker's rounding)."""
    return math.floor(x / increment + 0.5 + 1e-12) * increment


# ---------------------------------------------------------------- series ----

def _ewm(series: pd.Series, cfg: ModelConfig):
    return series.ewm(adjust=False, **{cfg.ema_mode: cfg.ema_length_days})


def valuation_bounds_series(nearby: pd.Series, cfg: ModelConfig) -> pd.DataFrame:
    """Columns: ema, std, upper, lower."""
    ew = _ewm(nearby, cfg)
    ema = ew.mean()
    std = ew.std(bias=True).fillna(0.0)
    return pd.DataFrame({
        "ema": ema, "std": std,
        "upper": ema + cfg.k_std_devs * std,
        "lower": ema - cfg.k_std_devs * std,
    })


def valuation_signal_series(price: pd.Series, bounds: pd.DataFrame) -> pd.Series:
    """100% at/below lower bound (short exposure), 0% at/above upper.
    `price` is aligned to bounds on the index (A5: may be a target contract)."""
    b = bounds.reindex(price.index)
    width = b["upper"] - b["lower"]
    sig = (b["upper"] - price) / width.where(width > 0)
    return sig.clip(0.0, 1.0).fillna(0.5)


def rsi_series(prices: pd.Series, period: int = 40, smoothing: int = 5) -> pd.Series:
    """Wilder RSI (A4), SMA-smoothed, scaled 0..1."""
    delta = prices.diff()
    gains = delta.clip(lower=0.0)
    losses = (-delta).clip(lower=0.0)
    alpha = 1.0 / period
    ag = gains.ewm(alpha=alpha, adjust=False).mean()
    al = losses.ewm(alpha=alpha, adjust=False).mean()
    rs = ag / al.where(al > 0)
    rsi = (100.0 - 100.0 / (1.0 + rs)).where(al > 0, 100.0)
    rsi[delta.isna()] = np.nan
    return rsi.rolling(smoothing).mean() / 100.0


def rolling_percentile(series: pd.Series, lookback: int, min_periods: int = None) -> pd.Series:
    """A9: share of window values <= current, x100. Window includes current."""
    mp = min_periods if min_periods is not None else lookback

    def _rank(w):
        return (w <= w[-1]).sum() / len(w) * 100.0

    return series.rolling(lookback, min_periods=mp).apply(_rank, raw=True)


# --------------------------------------------------------------- scalars ----

def valuation_bounds(nearby: pd.Series, cfg: ModelConfig) -> tuple:
    """Return (ema, upper, lower) as of the last observation."""
    b = valuation_bounds_series(nearby, cfg).iloc[-1]
    return b["ema"], b["upper"], b["lower"]


def valuation_signal(price: float, upper: float, lower: float) -> float:
    if upper <= lower:
        return 0.5
    return float(np.clip((upper - price) / (upper - lower), 0.0, 1.0))


def rsi_signal(nearby: pd.Series, cfg: ModelConfig) -> float:
    return float(rsi_series(nearby, cfg.rsi_period_days, cfg.rsi_smoothing_days).iloc[-1])


def percentile_rank(series: pd.Series, lookback: int) -> float:
    window = series.dropna().iloc[-lookback:]
    current = window.iloc[-1]
    return float((window <= current).sum() / len(window) * 100.0)


# ------------------------------------------------- additional HR signals ----

def stochastic_series(prices: pd.Series, k_days: int = 40, d_days: int = 5) -> pd.Series:
    """Stochastic oscillator on settlement prices (no high/low available):
    %K = (P - min_N) / (max_N - min_N), %D = SMA(%K). Scaled 0..1.
    Direction matches RSI: high = price near top of range. PLACEHOLDER params."""
    lo = prices.rolling(k_days).min()
    hi = prices.rolling(k_days).max()
    k = ((prices - lo) / (hi - lo).where(hi > lo)).fillna(0.5)
    k[lo.isna()] = np.nan
    return k.rolling(d_days).mean()


def vb_short_series(prices: pd.Series, ema_days: int, k: float = 2.0) -> pd.Series:
    """Short-period vol bounds used as MOMENTUM: position of price inside the
    short bounds, high price -> high signal (same direction as RSI).
    ASSUMPTION A16: direction not stated in the deck."""
    ew = prices.ewm(span=ema_days, adjust=False)
    ema, std = ew.mean(), ew.std(bias=True).fillna(0.0)
    up, lo = ema + k * std, ema - k * std
    return ((prices - lo) / (up - lo).where(up > lo)).clip(0.0, 1.0).fillna(0.5)


def momentum_series(nearby: pd.Series, cfg: ModelConfig):
    if cfg.momentum_signal is None or cfg.momentum_weight == 0:
        return None
    if cfg.momentum_signal == "rsi":
        return rsi_series(nearby, cfg.rsi_period_days, cfg.rsi_smoothing_days)
    if cfg.momentum_signal == "stochastic":
        return stochastic_series(nearby, cfg.stoch_k_days, cfg.stoch_d_days)
    if cfg.momentum_signal == "vb_short":
        return vb_short_series(nearby, cfg.vb_short_ema_days, cfg.k_std_devs)
    raise ValueError(f"unknown momentum_signal {cfg.momentum_signal}")


def hist_percentile_valuation(window: np.ndarray, price: float) -> float:
    """Short exposure: low price relative to history -> hedge more.
    signal = 1 - (share of history <= price). Window = nearby history (A9)."""
    window = window[~np.isnan(window)]
    if len(window) == 0:
        return 0.5
    share = np.searchsorted(np.sort(window), price, side="right") / len(window)
    return float(1.0 - share)
