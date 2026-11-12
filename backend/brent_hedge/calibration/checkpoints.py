"""Signal checkpoints from the GS worked examples.

Run against real data: if the LSEG data reproduces these, the EMA/percentile/
contract conventions (A5, A8, A9, A11) are confirmed. checkpoint_search() tries
convention variants and ranks them by error.
"""
import itertools
from dataclasses import replace

import pandas as pd

from ..config import ModelConfig
from ..engine import SignalEngine

# inception, months to exposure, expected valuation (0-1), IV pct, skew pct
CHECKPOINTS = [
    {"name": "A", "inception": "2021-01-15", "m": 15, "val": 0.638, "iv_pct": 72.6, "skew_pct": 5.9},
    {"name": "B", "inception": "2024-07-15", "m": 15, "val": 0.466, "iv_pct": 10.3, "skew_pct": 81.3},
    {"name": "C", "inception": "2021-04-15", "m": 30, "val": 0.566, "iv_pct": None, "skew_pct": None},
]


def check(provider, cfg: ModelConfig, checkpoints=CHECKPOINTS) -> pd.DataFrame:
    eng = SignalEngine(provider, cfg)
    rows = []
    for c in checkpoints:
        t = pd.Timestamp(c["inception"])
        t = provider.nearby.index[provider.nearby.index.searchsorted(t)]
        exp_month = (t + pd.DateOffset(months=c["m"])).to_period("M")
        contract = str(exp_month + cfg.contract_month_offset)
        price = provider.contract_price(t, contract)
        got = {"val": eng.valuation_at(t, price) if price is not None else None,
               "iv_pct": eng.iv_percentile_at(t), "skew_pct": eng.skew_percentile_at(t)}
        row = {"name": c["name"], "date": t.date(), "contract": contract}
        for k in ("val", "iv_pct", "skew_pct"):
            row[f"{k}_gs"], row[f"{k}_model"] = c[k], got[k]
            row[f"{k}_err"] = None if c[k] is None or got[k] is None else got[k] - c[k]
        rows.append(row)
    return pd.DataFrame(rows)


def checkpoint_search(provider, base: ModelConfig = None) -> pd.DataFrame:
    """Rank convention variants by total absolute error on the checkpoints
    (valuation in pct points, percentiles in points)."""
    base = base or ModelConfig()
    rows = []
    for mode, length, target, rr in itertools.product(
            ["span", "halflife"], [5040, 2520, 1260, 756], [True, False],
            ["call_minus_put", "put_minus_call"]):
        cfg = replace(base, ema_mode=mode, ema_length_days=length,
                      valuation_use_target_contract=target, rr_convention=rr)
        df = check(provider, cfg)
        err = (df["val_err"].abs().sum() * 100
               + df["iv_pct_err"].abs().sum() + df["skew_pct_err"].abs().sum())
        rows.append({"ema_mode": mode, "ema_length_days": length,
                     "target_contract": target, "rr_convention": rr, "total_abs_err": err,
                     "val_err_pts": (df["val_err"].abs() * 100).round(1).tolist()})
    return pd.DataFrame(rows).sort_values("total_abs_err").reset_index(drop=True)
