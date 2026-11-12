"""Benchmark buying programs (per the GS deck). Cost per unit of exposure."""
import pandas as pd

from ..config import ModelConfig
from ..data import DataProvider
from .strategy import inception_dates


def _program(provider: DataProvider, cfg: ModelConfig, schedule: dict, exposures) -> pd.DataFrame:
    """schedule: {months_to_exposure: fraction bought}; fractions sum to 1.
    Buys target futures at each inception date; settles at expiry price."""
    dates = inception_dates(provider, cfg)
    by_month = {d.to_period("M"): d for d in dates}
    rows = {}
    for exp_month in exposures:
        contract = str(exp_month + cfg.contract_month_offset)
        S = provider.settlement(contract)
        if S is None:
            continue
        cost, ok = 0.0, True
        for m, frac in schedule.items():
            t = by_month.get(exp_month - m)
            F = provider.contract_price(t, contract) if t is not None else None
            if F is None:
                ok = False
                break
            cost += frac * F
        if ok:
            rows[exp_month] = cost
    return pd.Series(rows, name="cost").sort_index()


def spot_buying(provider, cfg, exposures) -> pd.Series:
    out = {e: provider.settlement(str(e + cfg.contract_month_offset)) for e in exposures}
    return pd.Series({k: v for k, v in out.items() if v is not None}, name="cost").sort_index()


def rolling_futures(provider, cfg, exposures, months=9) -> pd.Series:
    return _program(provider, cfg, {months: 1.0}, exposures)


def linear_futures(provider, cfg, exposures, start=24, end=9) -> pd.Series:
    ms = list(range(end, start + 1))
    return _program(provider, cfg, {m: 1.0 / len(ms) for m in ms}, exposures)


def front_loaded(provider, cfg, exposures, start=24, end=9, front=0.5) -> pd.Series:
    ms = list(range(end, start + 1))
    sched = {m: (1 - front) / len(ms) for m in ms}
    sched[start] += front
    return _program(provider, cfg, sched, exposures)


def all_benchmarks(provider, cfg, exposures) -> pd.DataFrame:
    return pd.DataFrame({
        "spot": spot_buying(provider, cfg, exposures),
        "rolling_9m": rolling_futures(provider, cfg, exposures),
        "linear": linear_futures(provider, cfg, exposures, cfg.max_tenor_months, cfg.min_tenor_months),
        "front_loaded": front_loaded(provider, cfg, exposures, cfg.max_tenor_months, cfg.min_tenor_months),
    })
