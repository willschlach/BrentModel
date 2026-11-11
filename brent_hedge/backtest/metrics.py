"""GS ranking metrics: average coverage price, YoY volatility, stability,
trades per year, plus a points-based composite score.

Interpretations (flag to confirm with GS):
  A15  YoY vol = std of 12-month changes in monthly coverage price (USD).
  A19  Trades/yr = executed legs (per exposure, per instrument) per calendar
       year of monthly runs.
  A20  Stability = share of fixed-length blocks of exposure months where the
       strategy's average cost beats the 9m rolling futures benchmark.
"""
import numpy as np
import pandas as pd


def yoy_vol(cost: pd.Series) -> float:
    if cost.empty:
        return np.nan
    full = cost.reindex(pd.period_range(cost.index.min(), cost.index.max(), freq="M"))
    return float((full - full.shift(12)).std())


def block_improvements(cost: pd.Series, bench: pd.Series, block_months: int = 24) -> pd.Series:
    df = pd.concat([cost, bench], axis=1, keys=["s", "b"]).dropna()
    if df.empty:
        return pd.Series(dtype=float)
    blk = (np.arange(len(df)) // block_months)
    g = df.groupby(blk).mean()
    return (g["b"] - g["s"]) / g["b"]  # positive = cheaper than benchmark


def summarize(cost: pd.Series, bench: pd.Series, trades_per_year: float,
              block_months: int = 24) -> dict:
    imp = block_improvements(cost, bench, block_months)
    both = pd.concat([cost, bench], axis=1, keys=["s", "b"]).dropna()
    return {
        "avg_price": float(cost.mean()) if len(cost) else np.nan,
        "yoy_vol": yoy_vol(cost),
        "trades_per_year": trades_per_year,
        "stability": float((imp > 0).mean()) if len(imp) else np.nan,
        "improve_vs_rolling_pct": float((both["b"].mean() - both["s"].mean()) / both["b"].mean() * 100)
        if len(both) else np.nan,
        "vol_improve_vs_rolling_pct": float((yoy_vol(both["b"]) - yoy_vol(both["s"])) / yoy_vol(both["b"]) * 100)
        if len(both) > 12 else np.nan,
        "n_exposures": int(len(cost)),
    }


def trades_per_year(result) -> float:
    n_years = max(len(result.inception_dates) / 12.0, 1e-9)
    return float(len(result.trades) / n_years)


def evaluate(result, bench: pd.DataFrame, block_months: int = 24) -> dict:
    cost = result.exposures["cost"]
    return summarize(cost, bench["rolling_9m"], trades_per_year(result), block_months)


def composite_score(df: pd.DataFrame, weights=(1.0, 1.0, 1.0)) -> pd.Series:
    """Rank-points composite (0..1): lower price, lower vol, higher stability."""
    p = df["avg_price"].rank(ascending=False, pct=True)
    v = df["yoy_vol"].rank(ascending=False, pct=True)
    s = df["stability"].rank(ascending=True, pct=True)
    w = np.array(weights, dtype=float)
    return (w[0] * p + w[1] * v + w[2] * s) / w.sum()
