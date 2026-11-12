"""Command line entry points (run from the backend/ folder).

  python -m brent_hedge.cli quality     --synthetic | --data DIR
  python -m brent_hedge.cli checkpoints --synthetic | --data DIR
  python -m brent_hedge.cli rsi-proxy   --synthetic | --data DIR
  python -m brent_hedge.cli backtest    --synthetic | --data DIR [--preset deck24|sep2026]
  python -m brent_hedge.cli targets     --synthetic | --data DIR
"""
import argparse
import json
from dataclasses import replace

import pandas as pd

from .backtest.benchmarks import all_benchmarks
from .backtest.metrics import evaluate
from .backtest.regimes import regime_report
from .backtest.strategy import run_backtest
from .calibration.checkpoints import check, checkpoint_search
from .calibration.targets import compare_to_targets, run_targets
from .config import ModelConfig
from .data import DataProvider, make_synthetic
from .validation import rsi_proxy_validation

PRESETS = {
    "deck24": dict(min_tenor_months=9, max_tenor_months=24, min_futures_fraction=0.5,
                   momentum_weight=0.5, hr_bounds_variant="IV"),
    "sep2026": dict(),
}


def _provider(a):
    return make_synthetic() if a.synthetic else DataProvider.from_csv_dir(a.data)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["quality", "checkpoints", "rsi-proxy", "backtest", "targets"])
    ap.add_argument("--data")
    ap.add_argument("--synthetic", action="store_true")
    ap.add_argument("--preset", default="deck24", choices=list(PRESETS))
    a = ap.parse_args(argv)
    pd.set_option("display.width", 200, "display.max_columns", 30)
    p = _provider(a)

    if a.cmd == "quality":
        print(json.dumps(p.quality_report(), indent=2))
    elif a.cmd == "checkpoints":
        print(check(p, ModelConfig()).to_string(index=False))
        print("\nConvention search (best first):")
        print(checkpoint_search(p).head(8).to_string(index=False))
    elif a.cmd == "rsi-proxy":
        cols = [c for c in p.contracts.columns]
        out = rsi_proxy_validation(p.nearby, p.contracts[cols], months_window=(9, 24))
        print({k: v for k, v in out.items() if k != "per_contract"})
        print("GS benchmark: mean ~2, share below 6 > 0.95")
    elif a.cmd == "backtest":
        cfg = replace(ModelConfig(), **PRESETS[a.preset])
        r = run_backtest(p, cfg)
        b = all_benchmarks(p, cfg, r.exposures.index)
        print(evaluate(r, b))
        print("\nBenchmarks (avg price / yoy vol):")
        from .backtest.metrics import yoy_vol
        print(pd.DataFrame({"avg": b.mean(), "yoy_vol": [yoy_vol(b[c].dropna()) for c in b]}))
        print("\nRegimes:")
        print(regime_report(r.exposures["cost"], b).round(2).to_string())
    elif a.cmd == "targets":
        df = run_targets(p)
        print(df.round(2).to_string(index=False))
        print(compare_to_targets(df))


if __name__ == "__main__":
    main()
