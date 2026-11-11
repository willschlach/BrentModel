import math
import unittest

import numpy as np
import pandas as pd

from brent_hedge import pricing
from brent_hedge.config import ModelConfig
from brent_hedge.signals import (percentile_rank, rolling_percentile, rsi_series,
                                 valuation_bounds, valuation_bounds_series,
                                 valuation_signal, valuation_signal_series)
from brent_hedge.validation import rsi_proxy_validation


def _prices(n=800, seed=1):
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range("2018-01-01", periods=n)
    return pd.Series(80 * np.exp(np.cumsum(0.015 * rng.standard_normal(n))), index=idx)


class SeriesVsScalar(unittest.TestCase):
    def test_bounds_and_signal_match(self):
        s, cfg = _prices(), ModelConfig(ema_length_days=500)
        b = valuation_bounds_series(s, cfg)
        ema, up, lo = valuation_bounds(s, cfg)
        self.assertAlmostEqual(b["upper"].iloc[-1], up)
        sig = valuation_signal_series(s, b)
        self.assertAlmostEqual(sig.iloc[-1], valuation_signal(s.iloc[-1], up, lo))
        self.assertTrue(sig.between(0, 1).all())

    def test_no_lookahead(self):
        s, cfg = _prices(), ModelConfig(ema_length_days=500)
        full = valuation_bounds_series(s, cfg)
        part = valuation_bounds_series(s.iloc[:600], cfg)
        self.assertAlmostEqual(full["upper"].iloc[599], part["upper"].iloc[-1])

    def test_rolling_percentile_matches_scalar(self):
        s = _prices()
        rp = rolling_percentile(s, 300)
        self.assertAlmostEqual(rp.iloc[-1], percentile_rank(s, 300))

    def test_rsi_bounds(self):
        r = rsi_series(_prices())
        self.assertTrue(r.dropna().between(0, 1).all())


class Pricing(unittest.TestCase):
    def test_put_call_parity(self):
        F, K, v, T = 80, 85, 0.3, 1.25
        c = pricing.price(F, K, v, T, True)
        p = pricing.price(F, K, v, T, False)
        self.assertAlmostEqual(c - p, F - K, places=9)

    def test_strike_from_delta_roundtrip(self):
        F, v, T = 80, 0.3, 1.25
        for d, is_call in [(0.25, True), (-0.25, False)]:
            K = pricing.strike_from_delta(F, d, v, T, is_call)
            self.assertAlmostEqual(pricing.delta(F, K, v, T, is_call), d, places=9)
        self.assertGreater(pricing.strike_from_delta(F, 0.25, v, T, True), F)
        self.assertLess(pricing.strike_from_delta(F, -0.25, v, T, False), F)

    def test_implied_vol_roundtrip(self):
        p = pricing.price(80, 90, 0.35, 1.0, True, r=0.03)
        self.assertAlmostEqual(pricing.implied_vol(p, 80, 90, 1.0, True, r=0.03), 0.35, places=7)


class RsiProxy(unittest.TestCase):
    def test_identical_series_zero_diff(self):
        s = _prices()
        out = rsi_proxy_validation(s, pd.DataFrame({"c1": s, "c2": s * 0.97}))
        self.assertLess(out["mean_abs_diff"], 1e-9)
        self.assertEqual(out["share_below_threshold"], 1.0)


if __name__ == "__main__":
    unittest.main()
