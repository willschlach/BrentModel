"""SignalEngine: point-in-time signals for any date, built once per config."""
import numpy as np
import pandas as pd

from .config import ModelConfig
from .signals import (hist_percentile_valuation, momentum_series, percentile_rank,
                      valuation_bounds_series, valuation_signal)


class SignalEngine:
    def __init__(self, provider, cfg: ModelConfig):
        self.p, self.cfg = provider, cfg
        self.nearby = provider.nearby
        self.bounds = valuation_bounds_series(self.nearby, cfg)
        self.momentum = momentum_series(self.nearby, cfg)
        vol = provider.vol
        self.iv = vol["atmf_iv_15m"]
        self.rr = vol["call_iv_25d"] - vol["put_iv_25d"]  # A6
        self._nearby_vals = self.nearby.to_numpy()

    def _pos(self, asof) -> int:
        return self.nearby.index.searchsorted(pd.Timestamp(asof), side="right") - 1

    def momentum_at(self, asof) -> float:
        if self.momentum is None:
            return 0.0
        v = self.momentum.iloc[self._pos(asof)]
        return 0.5 if pd.isna(v) else float(v)

    def valuation_at(self, asof, price: float = None) -> float:
        """Valuation signal for `price` (default: nearby, or target if A5)."""
        i = self._pos(asof)
        if price is None:
            price = float(self._nearby_vals[i])
        if self.cfg.valuation_signal == "vol_bounds":
            b = self.bounds.iloc[i]
            return valuation_signal(price, b["upper"], b["lower"])
        if self.cfg.valuation_signal == "hist_percentile":
            lo = max(0, i + 1 - self.cfg.hist_percentile_lookback_days)
            return hist_percentile_valuation(self._nearby_vals[lo:i + 1], price)
        raise ValueError(f"unknown valuation_signal {self.cfg.valuation_signal}")

    def iv_percentile_at(self, asof) -> float:
        return percentile_rank(self.iv.loc[:asof], self.cfg.iv_lookback_days)

    def skew_percentile_at(self, asof) -> float:
        return percentile_rank(self.rr.loc[:asof], self.cfg.skew_lookback_days)

    def snapshot(self, asof) -> dict:
        return {"momentum": self.momentum_at(asof),
                "iv_pct": self.iv_percentile_at(asof),
                "skew_pct": self.skew_percentile_at(asof)}
