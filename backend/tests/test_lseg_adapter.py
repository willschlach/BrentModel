import unittest

import numpy as np
import pandas as pd

from brent_hedge.adapters.lseg import LsegConfig, build_provider, contract_months, contract_ric


class RicBuilder(unittest.TestCase):
    def test_default_template(self):
        cfg = LsegConfig()
        self.assertEqual(contract_ric("2022-06", cfg), "LCOM2")
        self.assertEqual(contract_ric("2025-12", cfg), "LCOZ5")

    def test_suffix_only_when_expired(self):
        cfg = LsegConfig(expired_suffix_template="^{decade}")
        self.assertEqual(contract_ric("2022-06", cfg, today="2026-01-01"), "LCOM2^2")
        self.assertEqual(contract_ric("2027-06", cfg, today="2026-01-01"), "LCOM7")

    def test_override(self):
        cfg = LsegConfig(ric_builder=lambda cm: f"X{cm}")
        self.assertEqual(contract_ric("2022-06", cfg), "X2022-06")

    def test_contract_months(self):
        ms = contract_months("2020-01-01", "2020-03-31", horizon=3)
        self.assertEqual(ms[0], "2020-03")
        self.assertEqual(ms[-1], "2020-06")


class FakeAssembly(unittest.TestCase):
    def test_build_provider(self):
        idx = pd.bdate_range("2020-01-01", "2020-06-30")
        base = pd.Series(np.linspace(60, 70, len(idx)), index=idx)

        def fetch(ric, fields, start, end):
            if ric == "LCOc1":
                return pd.DataFrame({"SETTLE": base})
            if ric.startswith("VOL"):
                return pd.DataFrame({"SETTLE": pd.Series(30.0, index=idx)})  # percent
            if ric == "LCOK0":
                return pd.DataFrame({"SETTLE": base + 1})
            raise KeyError(ric)

        cfg = LsegConfig(start="2020-01-01", end="2020-06-30",
                         vol_rics={"atmf_iv_15m": "VOL1", "call_iv_25d": "VOL2", "put_iv_25d": "VOL3"})
        p, rep = build_provider(fetch, cfg, months=["2020-05", "2020-06"])
        self.assertEqual(list(p.contracts.columns), ["2020-05"])
        self.assertEqual(len(rep["empty_contracts"]), 1)   # LCOM0 raised
        self.assertAlmostEqual(p.vol["atmf_iv_15m"].iloc[0], 0.30)

    def test_requires_vol_rics(self):
        with self.assertRaises(ValueError):
            build_provider(lambda *a: None, LsegConfig())


if __name__ == "__main__":
    unittest.main()
