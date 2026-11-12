import json
import unittest
from collections import Counter

import pandas as pd

from brent_hedge.config import ModelConfig
from brent_hedge.data import make_synthetic
from brent_hedge.export import build_snapshot
from brent_hedge.flags import FlagConfig, _near_boundary, compute_flags
from brent_hedge.run_monthly import run
from brent_hedge.state import HedgeState

P = make_synthetic(start="2008-01-02", end="2016-12-30")
CFG = ModelConfig()


class Flags(unittest.TestCase):
    def test_near_boundary(self):
        self.assertTrue(_near_boundary(62.4, 5.0, 0.5))    # boundary at 62.5
        self.assertFalse(_near_boundary(60.0, 5.0, 0.5))   # mid-bucket, far from boundary

    def test_synthetic_and_stale_flags(self):
        rows = run(P, P.nearby.index[-1], CFG, HedgeState(), raw=True)
        flags = compute_flags(rows, "2017-01-20", "2016-12-30", "synthetic", CFG)
        ids = {f["id"] for f in flags}
        self.assertIn("DATA_SYNTHETIC", ids)
        self.assertIn("DATA_STALE", ids)

    def test_gs_format_unchanged(self):
        df = run(P, P.nearby.index[-1], CFG, HedgeState())
        self.assertNotIn("rawtarget", df.columns)
        self.assertIn("Incremental HR", df.columns)
        self.assertEqual(len(df), 40)


class Snapshot(unittest.TestCase):
    def test_snapshot_is_valid_json_and_consistent(self):
        snap = build_snapshot(P, CFG, "synthetic")
        s = json.dumps(snap, allow_nan=False)   # no NaN/inf anywhere
        d = json.loads(s)
        self.assertEqual(d["schemaVersion"], 1)
        self.assertEqual(len(d["rows"]), 40)
        for r in d["rows"]:
            self.assertGreaterEqual(r["incrementalHr"], 0)
            self.assertAlmostEqual(r["futuresPct"] + r["optionsPct"] + r["collarsPct"], 1.0)
            self.assertLessEqual(r["minHr"], r["maxHr"])
        self.assertTrue(any(f["id"] == "DATA_SYNTHETIC" for f in d["flags"]))


if __name__ == "__main__":
    unittest.main()
