"""Data layer. Swap/extend the loader when the LSEG format is known.

CSV layout (a data directory), column names overridable via `rename`:
  nearby.csv : date, price
  vol.csv    : date, atmf_iv_15m, call_iv_25d, put_iv_25d   (vols as decimals)
  curve.csv  : date, contract_month (YYYY-MM), price        (long format)
     or contracts.csv : date + one column per contract month (wide)
"""
from pathlib import Path

import numpy as np
import pandas as pd

VOL_COLS = ["atmf_iv_15m", "call_iv_25d", "put_iv_25d"]


def contract_expiry(contract_month: str) -> pd.Timestamp:
    """ICE Brent: last business day of the 2nd month before contract month
    (e.g. Jun-2022 contract expires 29-Apr-2022). Holidays not modelled (A8)."""
    m = pd.Period(contract_month, "M") - 2
    return pd.Timestamp(m.start_time.normalize()) + pd.offsets.BMonthEnd(0)


class DataProvider:
    """Holds market data and answers point-in-time queries (no look-ahead)."""

    def __init__(self, nearby: pd.Series, vol: pd.DataFrame, contracts: pd.DataFrame):
        self.nearby = nearby.sort_index().astype(float)
        self.vol = vol.sort_index()
        self.contracts = contracts.sort_index()  # wide: date x contract_month

    # ---- loading ----------------------------------------------------------
    @classmethod
    def from_csv_dir(cls, path, rename: dict = None) -> "DataProvider":
        p, rn = Path(path), rename or {}

        def rd(name):
            return pd.read_csv(p / name, parse_dates=["date"]).rename(columns=rn)

        nearby = rd("nearby.csv").set_index("date")["price"]
        vol = rd("vol.csv").set_index("date")[VOL_COLS]
        if (p / "contracts.csv").exists():
            contracts = rd("contracts.csv").set_index("date")
        else:
            long = rd("curve.csv")
            contracts = long.pivot_table(index="date", columns="contract_month",
                                         values="price", aggfunc="last")
        contracts.columns = [str(c) for c in contracts.columns]
        return cls(nearby, vol, contracts)

    # ---- point-in-time access ---------------------------------------------
    def nearby_to(self, asof) -> pd.Series:
        return self.nearby.loc[:asof]

    def vol_to(self, asof) -> pd.DataFrame:
        return self.vol.loc[:asof]

    def contract_price(self, asof, contract_month: str):
        try:
            v = self.contracts.at[pd.Timestamp(asof), contract_month]
        except KeyError:
            return None
        return None if pd.isna(v) else float(v)

    def settlement(self, contract_month: str):
        """Final price of a contract if it has expired within the data, else None."""
        if contract_month not in self.contracts.columns:
            return None
        s = self.contracts[contract_month].dropna()
        if s.empty or s.index[-1] < contract_expiry(contract_month) - pd.Timedelta(days=4):
            return None
        return float(s.iloc[-1])

    # ---- diagnostics ------------------------------------------------------
    def quality_report(self) -> dict:
        rep = {}
        for name, s in [("nearby", self.nearby)] + [(c, self.vol[c]) for c in VOL_COLS]:
            idx = s.dropna().index
            gaps = pd.Series(idx[1:] - idx[:-1], index=idx[1:])
            rep[name] = {
                "start": str(idx[0].date()), "end": str(idx[-1].date()), "n": len(idx),
                "years": round((idx[-1] - idx[0]).days / 365.25, 1),
                "missing_vs_bdays": int(len(pd.bdate_range(idx[0], idx[-1])) - len(idx)),
                "max_gap_days": int(gaps.max().days) if len(gaps) else 0,
                "nonpositive": int((s.dropna() <= 0).sum()),
                "duplicates": int(s.index.duplicated().sum()),
            }
        c = self.contracts
        rep["contracts"] = {"n_columns": c.shape[1], "start": str(c.index[0].date()),
                            "end": str(c.index[-1].date()),
                            "nonpositive": int((c <= 0).sum().sum())}
        rep["vol_sanity"] = {"iv_median": float(self.vol["atmf_iv_15m"].median()),
                             "iv_looks_like_percent": bool(self.vol["atmf_iv_15m"].median() > 3)}
        return rep


def make_synthetic(start="2008-01-02", end="2026-11-02", seed=7,
                   max_contract_months=52) -> DataProvider:
    """Coherent synthetic Brent: contracts converge to the nearby path at
    expiry, with mild backwardation. For plumbing/tests only, NOT calibration."""
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range(start, end)
    n = len(dates)
    logp = np.empty(n)
    logp[0] = np.log(80.0)
    for i in range(1, n):
        logp[i] = logp[i - 1] + 0.0005 * (np.log(75.0) - logp[i - 1]) + 0.018 * rng.standard_normal()
    nearby = pd.Series(np.exp(logp), index=dates, name="price")

    ret = nearby.pct_change().abs().rolling(20).mean().bfill()
    atmf = (0.25 + 4.0 * ret + 0.02 * rng.standard_normal(n)).clip(0.12, 0.8)
    rr = np.zeros(n)
    for i in range(1, n):
        rr[i] = 0.98 * rr[i - 1] + 0.004 * rng.standard_normal()
    vol = pd.DataFrame({"atmf_iv_15m": atmf.values, "call_iv_25d": (atmf + 0.5 * rr).values,
                        "put_iv_25d": (atmf - 0.5 * rr).values}, index=dates)

    first = dates[0].to_period("M") + 2
    last = dates[-1].to_period("M") + max_contract_months
    cols = {}
    for cm in pd.period_range(first, last, freq="M"):
        exp = contract_expiry(str(cm))
        days = (exp - dates).days.to_numpy()
        listed = (days >= 0) & (days <= 365 * 4.5)
        vals = nearby.to_numpy() * np.exp(-0.0015 * days / 30.4)
        # converge exactly to nearby at expiry; contract has own settle price
        s = pd.Series(np.where(listed, vals, np.nan), index=dates)
        cols[str(cm)] = s
    contracts = pd.DataFrame(cols).dropna(how="all", axis=1)
    return DataProvider(nearby, vol, contracts)
