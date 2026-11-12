"""LSEG adapter SKELETON. Nothing here has been run against LSEG.

UNVERIFIED items (confirm with LSEG, then set in LsegConfig):
  - Brent contract RIC pattern and year-code convention
  - suffix used for expired contracts
  - settlement field name (SETTLE vs TRDPRC_1 etc.)
  - RICs / units of the 15m ATMF and 25-delta call/put vol series
  - lseg.data get_history call signature and daily history depth

Design: the model never sees vendor names. A `fetch(ric, fields, start, end)`
callable returns a date-indexed DataFrame; swap it for tests or another vendor.
"""
from dataclasses import dataclass, field
from typing import Callable, Optional

import pandas as pd

from ..data import DataProvider, contract_expiry

MONTH_CODES = "FGHJKMNQUVXZ"   # Jan..Dec (CME/ICE standard futures month codes)

Fetcher = Callable[[str, list, str, str], pd.DataFrame]


@dataclass
class LsegConfig:
    start: str = "2008-01-01"
    end: str = "2026-11-10"
    nearby_ric: str = "LCOc1"                    # continuation RIC (UNVERIFIED)
    contract_ric_template: str = "{root}{m}{y1}"  # UNVERIFIED
    root: str = "LCO"
    # appended for contracts already expired, e.g. "^{decade}" (UNKNOWN: leave
    # empty until LSEG confirms how expired RICs are named)
    expired_suffix_template: str = ""
    price_field: str = "SETTLE"                   # UNVERIFIED
    # vol RICs are unknown: must be filled in. Keys fixed by the model.
    vol_rics: dict = field(default_factory=lambda: {
        "atmf_iv_15m": None, "call_iv_25d": None, "put_iv_25d": None})
    vol_field: str = "SETTLE"                     # UNVERIFIED
    vol_scale: float = 0.01                       # 0.01 if vendor quotes percent
    # optional full override: contract_month "YYYY-MM" -> RIC
    ric_builder: Optional[Callable[[str], str]] = None


def contract_ric(contract_month: str, cfg: LsegConfig, today=None) -> str:
    if cfg.ric_builder is not None:
        return cfg.ric_builder(contract_month)
    p = pd.Period(contract_month, "M")
    ric = cfg.contract_ric_template.format(
        root=cfg.root, m=MONTH_CODES[p.month - 1], y1=str(p.year)[-1], y2=str(p.year)[-2:])
    today = pd.Timestamp(today) if today is not None else pd.Timestamp.today()
    if cfg.expired_suffix_template and contract_expiry(contract_month) < today:
        ric += cfg.expired_suffix_template.format(decade=str(p.year // 10 % 10), year=p.year)
    return ric


def lseg_fetcher() -> Fetcher:
    """Real fetcher. Requires `pip install lseg-data` and an open session.
    UNTESTED: get_history arguments follow the library's documented pattern."""
    import lseg.data as rd  # lazy import so the package works without it

    def fetch(ric, fields, start, end):
        df = rd.get_history(universe=ric, fields=fields, interval="daily",
                            start=start, end=end)
        df.index = pd.to_datetime(df.index)
        return df
    return fetch


def contract_months(start: str, end: str, horizon: int = 52) -> list:
    first = pd.Timestamp(start).to_period("M") + 2
    last = pd.Timestamp(end).to_period("M") + horizon
    return [str(p) for p in pd.period_range(first, last, freq="M")]


def build_provider(fetch: Fetcher, cfg: LsegConfig, months: list = None) -> tuple:
    """Fetch everything and assemble a DataProvider.
    Returns (provider, report) where report lists RICs that returned nothing."""
    missing_cfg = [k for k, v in cfg.vol_rics.items() if not v]
    if missing_cfg:
        raise ValueError(f"vol RICs not configured: {missing_cfg}")

    report = {"empty_contracts": [], "rics": {}}
    nearby = fetch(cfg.nearby_ric, [cfg.price_field], cfg.start, cfg.end)[cfg.price_field].dropna()

    cols = {}
    for cm in (months or contract_months(cfg.start, cfg.end)):
        ric = contract_ric(cm, cfg, today=cfg.end)
        report["rics"][cm] = ric
        try:
            df = fetch(ric, [cfg.price_field], cfg.start, cfg.end)
        except Exception as e:  # vendor errors are per-RIC; keep going
            report["empty_contracts"].append((cm, ric, str(e)))
            continue
        s = df[cfg.price_field].dropna() if cfg.price_field in df else pd.Series(dtype=float)
        if s.empty:
            report["empty_contracts"].append((cm, ric, "no data"))
            continue
        cols[cm] = s
    contracts = pd.DataFrame(cols)

    vol = pd.DataFrame({
        k: fetch(ric, [cfg.vol_field], cfg.start, cfg.end)[cfg.vol_field] * cfg.vol_scale
        for k, ric in cfg.vol_rics.items()})
    return DataProvider(nearby, vol, contracts), report
