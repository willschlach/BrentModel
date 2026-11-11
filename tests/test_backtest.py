import unittest
from dataclasses import replace

import numpy as np
import pandas as pd

from brent_hedge.backtest.benchmarks import all_benchmarks
from brent_hedge.backtest.instruments import make_collar, make_call
from brent_hedge.backtest.metrics import composite_score, yoy_vol
from brent_hedge.backtest.strategy import run_backtest
from brent_hedge.calibration.targets import config_from_target, load_targets
from brent_hedge.config import ModelConfig
from brent_hedge.data import contract_expiry, make_synthetic
from brent_hedge.hr_bounds import get_bounds, register_bounds
from brent_hedge.signals import (hist_percentile_valuation, stochastic_series,
                                 vb_short_series)

P = make_synthetic(start="2008-01-02", end="2016-12-30")
DECK = ModelConfig(min_tenor_months=9, max_tenor_months=24, min_futures_fraction=0.5,
                   momentum_weight=0.5)


class Basics(unittest.TestCase):
    def test_expiry_convention(self):
        self.assertEqual(contract_expiry("2022-06"), pd.Timestamp("2022-04-29"))

    def test_bounds_variants(self):
        self.assertEqual(get_bounds(12, "I"), (0.0, 1.0))
        with self.assertRaises(NotImplementedError):
            get_bounds(12, "V")
        register_bounds("TESTV", {12: (0.1, 1.0)})
        self.assertEqual(get_bounds(12, "TESTV"), (0.1, 1.0))

    def test_signals_in_range(self):
        s = P.nearby
        self.assertTrue(stochastic_series(s).dropna().between(0, 1).all())
        self.assertTrue(vb_short_series(s, 252).between(0, 1).all())
        w = s.to_numpy()[:500]
        self.assertAlmostEqual(hist_percentile_valuation(w, w.min() - 1), 1.0)
        self.assertAlmostEqual(hist_percentile_valuation(w, w.max() + 1), 0.0)


class Instruments(unittest.TestCase):
    VOLS = {"atmf_iv_15m": 0.30, "call_iv_25d": 0.31, "put_iv_25d": 0.33}

    def test_zero_cost_collar(self):
        lg = make_collar(80.0, 1.25, self.VOLS, "25d", 1.0)
        self.assertAlmostEqual(lg.premium, 0.0, places=6)
        self.assertLess(lg.put_strike, 80.0)
        self.assertGreater(lg.strike, 80.0)
        self.assertAlmostEqual(lg.unit_cost(50.0), lg.put_strike, places=6)   # floor
        self.assertAlmostEqual(lg.unit_cost(70.0), 70.0, places=6)           # between strikes
        self.assertAlmostEqual(lg.unit_cost(150.0), lg.strike, places=6)      # cap

    def test_call_cost_capped(self):
        lg = make_call(80.0, 1.25, self.VOLS, "25d", 1.0)
        self.assertAlmostEqual(lg.unit_cost(200.0), lg.strike + lg.premium)
        self.assertAlmostEqual(lg.unit_cost(50.0), 50.0 + lg.premium)


class Backtest(unittest.TestCase):
    def test_runs_and_is_consistent(self):
        r = run_backtest(P, DECK)
        self.assertGreater(len(r.exposures), 20)
        # full coverage at 9m under bounds IV
        self.assertTrue((r.exposures["hedged"] > 0.999).all())
        self.assertTrue((r.runs["incr"] >= 0).all())  # ratchet
        # costs sit within a plausible band of settlement
        self.assertTrue((r.exposures["cost"] > 0).all())

    def test_futures_only_matches_weighted_futures(self):
        # 100% futures, no options: cost = sum(size * futures price)
        cfg = replace(DECK, min_futures_fraction=1.0)
        r = run_backtest(P, cfg)
        t = r.trades
        self.assertEqual(set(t["kind"]), {"FUT"})
        e = r.exposures.index[5]
        sub = t[t["exposure"] == e]
        self.assertAlmostEqual((sub["size"] * sub["strike"]).sum(), r.exposures.loc[e, "cost"], places=6)

    def test_no_lookahead_in_decisions(self):
        full = run_backtest(P, DECK)
        cut = run_backtest(P, DECK, end="2013-06-30")
        key = ["inception", "exposure"]
        a = cut.runs.set_index(key)["target"]
        b = full.runs.set_index(key)["target"].reindex(a.index)
        pd.testing.assert_series_equal(a, b)

    def test_benchmarks(self):
        r = run_backtest(P, DECK)
        b = all_benchmarks(P, DECK, r.exposures.index)
        self.assertEqual(len(b.dropna()), len(r.exposures))
        # spot benchmark equals recorded settlement
        np.testing.assert_allclose(b["spot"], r.exposures["settle"])

    def test_metrics_helpers(self):
        s = pd.Series(np.arange(36, dtype=float), index=pd.period_range("2015-01", periods=36, freq="M"))
        self.assertAlmostEqual(yoy_vol(s), 0.0)  # constant 12m change
        df = pd.DataFrame({"avg_price": [1, 2], "yoy_vol": [1, 2], "stability": [0.9, 0.1]})
        self.assertGreater(composite_score(df).iloc[0], composite_score(df).iloc[1])


class Targets(unittest.TestCase):
    def test_all_rows_map(self):
        for _, row in load_targets().iterrows():
            cfg = config_from_target(row)
            self.assertEqual(cfg.max_tenor_months, 24)
            self.assertEqual(cfg.min_futures_fraction, 0.5)
        r2 = load_targets().set_index("rank").loc[2]
        c2 = config_from_target(r2)
        self.assertIsNone(c2.momentum_signal)
        self.assertEqual(c2.valuation_signal, "hist_percentile")
        self.assertFalse(c2.allow_collars)


if __name__ == "__main__":
    unittest.main()
