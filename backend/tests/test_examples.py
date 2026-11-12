"""Reproduces the three worked examples from the spec."""
import unittest

from brent_hedge.allocation import allocate
from brent_hedge.config import ModelConfig
from brent_hedge.hr_bounds import get_bounds

CFG = ModelConfig()


class WorkedExamples(unittest.TestCase):
    def test_bounds_table(self):
        self.assertEqual(get_bounds(48), (0.0, 1.0))
        self.assertEqual(get_bounds(25), (0.0, 1.0))
        self.assertAlmostEqual(get_bounds(24)[0], 0.0625)
        self.assertAlmostEqual(get_bounds(15)[0], 0.625)
        self.assertAlmostEqual(get_bounds(9)[0], 1.0)

    def test_example_a(self):
        a = allocate(15, 0.638, 0.0, 72.6, 5.9, 0.60, CFG)
        self.assertAlmostEqual(a.target_hr, 0.85)
        self.assertAlmostEqual(a.incremental_hr, 0.25)
        self.assertAlmostEqual(a.futures_pct, 0.80)
        self.assertEqual(a.instrument, "COLLARS")
        self.assertAlmostEqual(a.incr_futures, 0.20)
        self.assertAlmostEqual(a.incr_options, 0.0)
        self.assertAlmostEqual(a.incr_collars, 0.05)

    def test_example_b(self):
        a = allocate(15, 0.466, 0.0, 10.3, 81.3, 0.65, CFG)
        self.assertAlmostEqual(a.target_hr, 0.80)
        self.assertAlmostEqual(a.incremental_hr, 0.15)
        self.assertAlmostEqual(a.futures_pct, 0.35)
        self.assertEqual(a.instrument, "CALLS")
        self.assertAlmostEqual(a.incr_futures, 0.0525)
        self.assertAlmostEqual(a.incr_options, 0.0975)
        self.assertAlmostEqual(a.incr_collars, 0.0)

    def test_example_c(self):
        a = allocate(30, 0.566, 0.0, 50.0, 50.0, 0.40, CFG)
        self.assertAlmostEqual(a.target_hr, 0.55)
        self.assertAlmostEqual(a.incremental_hr, 0.15)
        self.assertEqual(a.instrument, "FUTURES_ONLY")
        self.assertAlmostEqual(a.incr_futures, 0.15)


if __name__ == "__main__":
    unittest.main()
