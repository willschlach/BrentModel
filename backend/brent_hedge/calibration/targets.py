"""GS top-20 strategy table as calibration targets.

Rows marked confidence=low were hard to read from the source image: verify.
'Flex' in the GS bounds labels (e.g. '9m HR IV Flex') is undefined and ignored.
Bounds V is not yet defined (register it via hr_bounds.register_bounds_csv);
rows needing it are skipped until then.
"""
from dataclasses import replace
from pathlib import Path

import pandas as pd

from ..backtest.benchmarks import all_benchmarks
from ..backtest.metrics import evaluate
from ..backtest.strategy import run_backtest
from ..config import ModelConfig
from ..hr_bounds import bounds_available

TARGETS_PATH = Path(__file__).with_name("targets_top20.csv")
DECK_FRAME = dict(min_tenor_months=9, max_tenor_months=24)


def load_targets(path=TARGETS_PATH) -> pd.DataFrame:
    return pd.read_csv(path)


def config_from_target(row, base: ModelConfig = None) -> ModelConfig:
    cfg = replace(base or ModelConfig(), **DECK_FRAME)
    sig = row["hr_signal"]
    momentum, _, valuation = sig.partition("/")
    if not valuation:  # valuation-only
        momentum, valuation = None, sig
    return replace(
        cfg,
        momentum_signal="rsi" if momentum == "RSI" else None,
        momentum_weight=float(row["momentum_weight"]) if momentum else 0.0,
        valuation_signal="vol_bounds" if valuation == "VB" else "hist_percentile",
        hr_bounds_variant=row["hr_bounds"],
        min_futures_fraction=float(row["min_futures"]),
        option_type="atmf" if row["option_otm"] == "ATMF" else "25d",
        allow_collars="C" in row["group"].split("+"),
    )


def run_targets(provider, base: ModelConfig = None, only_high_confidence=False) -> pd.DataFrame:
    """Backtest every target strategy and line up against GS numbers."""
    t = load_targets()
    if only_high_confidence:
        t = t[t["confidence"] == "high"]
    rows = []
    for _, r in t.iterrows():
        row = {"rank": r["rank"], "bounds": r["hr_bounds"], "signal": r["hr_signal"],
               "gs_price": r["avg_price"], "gs_vol": r["yoy_vol"], "gs_trades": r["trades_per_year"]}
        if not bounds_available(r["hr_bounds"]):
            row["status"] = f"skipped: bounds {r['hr_bounds']} undefined"
            rows.append(row)
            continue
        cfg = config_from_target(r, base)
        res = run_backtest(provider, cfg)
        bench = all_benchmarks(provider, cfg, res.exposures.index)
        m = evaluate(res, bench)
        row.update(price=m["avg_price"], vol=m["yoy_vol"], trades=m["trades_per_year"],
                   stability=m["stability"], improve_pct=m["improve_vs_rolling_pct"], status="ok")
        rows.append(row)
    return pd.DataFrame(rows)


def compare_to_targets(df: pd.DataFrame) -> dict:
    """Shape-based comparison (levels depend on data/period; ordering matters):
    rank correlations and relative gaps, plus GS's own headline claims."""
    ok = df[df["status"] == "ok"].copy()
    out = {"n_compared": int(len(ok))}
    if len(ok) >= 3:
        for ours, gs in [("price", "gs_price"), ("vol", "gs_vol"), ("trades", "gs_trades")]:
            out[f"spearman_{ours}"] = float(ok[ours].corr(ok[gs], method="spearman"))
            out[f"mean_abs_pct_gap_{ours}"] = float(((ok[ours] - ok[gs]).abs() / ok[gs]).mean() * 100)
    return out
