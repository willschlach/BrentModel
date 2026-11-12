"""Regime stress tests. Date ranges are approximate and editable.
A regime is applied to the EXPOSURE month of each settled hedge program."""
import pandas as pd

from .metrics import summarize

DEFAULT_REGIMES = {
    "gfc_2008_09": ("2008-07", "2009-06"),
    "recovery_2010_13": ("2010-01", "2013-12"),
    "oil_crash_2014_16": ("2014-07", "2016-06"),
    "range_2017_19": ("2017-01", "2019-12"),
    "covid_2020": ("2020-01", "2020-12"),
    "ukraine_spike_2022": ("2022-02", "2022-12"),
    "post_spike_2023_25": ("2023-01", "2025-12"),
}


def regime_report(cost: pd.Series, bench: pd.DataFrame, regimes: dict = None,
                  trades_per_year: float = float("nan")) -> pd.DataFrame:
    rows = []
    for name, (a, b) in (regimes or DEFAULT_REGIMES).items():
        mask = (cost.index >= pd.Period(a, "M")) & (cost.index <= pd.Period(b, "M"))
        c = cost[mask]
        if len(c) < 3:
            continue
        r = summarize(c, bench["rolling_9m"].reindex(c.index), trades_per_year, block_months=6)
        for k in ("spot", "linear", "front_loaded"):
            r[f"vs_{k}_pct"] = float((bench[k].reindex(c.index).mean() - c.mean())
                                     / bench[k].reindex(c.index).mean() * 100)
        r["regime"] = name
        rows.append(r)
    return pd.DataFrame(rows).set_index("regime") if rows else pd.DataFrame()
