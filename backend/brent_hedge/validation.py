"""Independent signal validation."""
import pandas as pd

from .data import contract_expiry
from .signals import rsi_series


def rsi_proxy_validation(nearby: pd.Series, contracts: pd.DataFrame,
                         period: int = 40, smoothing: int = 5,
                         tail_threshold: float = 6.0, months_window: tuple = None) -> dict:
    """Compare nearby-based RSI with RSI on each target contract's own prices.

    contracts: DataFrame, one column per target contract (price history).
    GS benchmark: mean abs diff ~2 RSI points; below 6 points >95% of the time.
    months_window=(9, 24) restricts the comparison to dates when the contract
    is 9..24 months from expiry (column names must be contract months).
    Returns overall stats and a per-contract table (RSI on 0..100 scale).
    """
    spot_rsi = rsi_series(nearby, period, smoothing) * 100.0
    rows, all_diffs = [], []
    for col in contracts.columns:
        c_rsi = rsi_series(contracts[col].dropna(), period, smoothing) * 100.0
        diff = (c_rsi - spot_rsi.reindex(c_rsi.index)).abs().dropna()
        if months_window is not None:
            days = (contract_expiry(str(col)) - diff.index).days
            diff = diff[(days >= months_window[0] * 30.4) & (days <= months_window[1] * 30.4)]
            if diff.empty:
                continue
        if diff.empty:
            continue
        all_diffs.append(diff)
        rows.append({"contract": col, "n": len(diff), "mean_abs_diff": diff.mean(),
                     "share_below_threshold": (diff < tail_threshold).mean()})
    if not all_diffs:
        raise ValueError("no overlapping observations")
    pooled = pd.concat(all_diffs)
    return {
        "mean_abs_diff": float(pooled.mean()),
        "share_below_threshold": float((pooled < tail_threshold).mean()),
        "p95_abs_diff": float(pooled.quantile(0.95)),
        "n": int(len(pooled)),
        "per_contract": pd.DataFrame(rows),
    }
