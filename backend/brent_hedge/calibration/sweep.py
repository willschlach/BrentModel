"""Parameter sweeps: one-at-a-time (GS method) and full grid."""
import itertools
from dataclasses import replace

import pandas as pd

from ..backtest.benchmarks import all_benchmarks
from ..backtest.metrics import composite_score, evaluate
from ..backtest.strategy import run_backtest
from ..config import ModelConfig


def _run(provider, cfg, params: dict) -> dict:
    res = run_backtest(provider, cfg)
    bench = all_benchmarks(provider, cfg, res.exposures.index)
    return {**params, **evaluate(res, bench)}


def one_at_a_time(provider, base: ModelConfig, grid: dict) -> pd.DataFrame:
    """Vary each parameter alone while all others stay at `base`."""
    rows = []
    for name, values in grid.items():
        for v in values:
            rows.append({"param": name, **_run(provider, replace(base, **{name: v}), {"value": v})})
    return pd.DataFrame(rows)


def full_grid(provider, base: ModelConfig, grid: dict, weights=(1, 1, 1)) -> pd.DataFrame:
    names = list(grid)
    rows = []
    for combo in itertools.product(*grid.values()):
        params = dict(zip(names, combo))
        rows.append(_run(provider, replace(base, **params), params))
    df = pd.DataFrame(rows)
    df["score"] = composite_score(df, weights)
    return df.sort_values("score", ascending=False).reset_index(drop=True)
