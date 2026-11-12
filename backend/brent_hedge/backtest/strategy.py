"""Monthly-inception backtest of the dynamic hedging model."""
from dataclasses import dataclass, field

import pandas as pd

from ..allocation import allocate
from ..config import ModelConfig
from ..data import DataProvider, contract_expiry
from ..engine import SignalEngine
from .instruments import make_call, make_collar, Leg

EPS = 1e-12


@dataclass
class BacktestResult:
    cfg: ModelConfig
    exposures: pd.DataFrame      # index: exposure month (Period), cols: cost, hedged, settle
    trades: pd.DataFrame         # one row per executed leg
    runs: pd.DataFrame           # one row per (inception, exposure) decision
    inception_dates: list = field(default_factory=list)


def inception_dates(provider: DataProvider, cfg: ModelConfig, start=None, end=None):
    idx = provider.nearby.index
    lo = idx[min(cfg.warmup_days, len(idx) - 1)]
    start = max(pd.Timestamp(start), lo) if start is not None else lo
    end = pd.Timestamp(end) if end is not None else idx[-1]
    out = []
    for per in pd.period_range(start.to_period("M"), end.to_period("M"), freq="M"):
        target = pd.Timestamp(per.year, per.month, cfg.inception_day)
        pos = idx.searchsorted(target)
        if pos >= len(idx):
            break
        d = idx[pos]
        if d.to_period("M") == per and start <= d <= end:
            out.append(d)
    return out


def run_backtest(provider: DataProvider, cfg: ModelConfig, start=None, end=None) -> BacktestResult:
    if not cfg.ratchet_only:
        raise NotImplementedError("unwinding hedges is not modelled (A14)")
    eng = SignalEngine(provider, cfg)
    dates = inception_dates(provider, cfg, start, end)
    state, legs = {}, {}         # exposure month -> hr, list[Leg]
    first_run = {}
    runs, trades = [], []

    for t in dates:
        snap = eng.snapshot(t)
        near_val = eng.valuation_at(t)
        vols = provider.vol.loc[:t].iloc[-1]
        for m in range(cfg.min_tenor_months, cfg.max_tenor_months + 1):
            exp_month = (t + pd.DateOffset(months=m)).to_period("M")
            contract = str(exp_month + cfg.contract_month_offset)
            F = provider.contract_price(t, contract)
            if F is None:
                continue
            first_run.setdefault(exp_month, m)
            val = eng.valuation_at(t, F) if cfg.valuation_use_target_contract else near_val
            cur = state.get(exp_month, 0.0)
            a = allocate(m, val, snap["momentum"], snap["iv_pct"], snap["skew_pct"], cur, cfg)
            runs.append({"inception": t, "exposure": exp_month, "m": m, "val": val,
                         "target": a.target_hr, "incr": a.incremental_hr})
            if a.incremental_hr <= EPS:
                continue
            T = max((contract_expiry(contract) - t).days, 1) / 365.0
            new = []
            if a.incr_futures > EPS:
                new.append(Leg("FUT", a.incr_futures, F))
            if a.incr_options > EPS:
                new.append(make_call(F, T, vols, cfg.option_type, a.incr_options))
            if a.incr_collars > EPS:
                new.append(make_collar(F, T, vols, cfg.option_type, a.incr_collars))
            for lg in new:
                trades.append({"inception": t, "exposure": exp_month, "m": m, "kind": lg.kind,
                               "size": lg.size, "strike": lg.strike, "premium": lg.premium,
                               "put_strike": lg.put_strike})
            legs.setdefault(exp_month, []).extend(new)
            state[exp_month] = cur + a.incremental_hr

    # Settle exposures whose full program is observed and whose contract expired
    rows = []
    for exp_month, hr in state.items():
        if first_run.get(exp_month) != cfg.max_tenor_months:
            continue  # program started before data (partial history)
        S = provider.settlement(str(exp_month + cfg.contract_month_offset))
        if S is None:
            continue
        cost = sum(l.size * l.unit_cost(S) for l in legs.get(exp_month, [])) + (1 - hr) * S
        rows.append({"exposure": exp_month, "cost": cost, "hedged": hr, "settle": S})
    exposures = pd.DataFrame(rows).set_index("exposure").sort_index() if rows else \
        pd.DataFrame(columns=["cost", "hedged", "settle"])
    return BacktestResult(cfg, exposures, pd.DataFrame(trades), pd.DataFrame(runs), dates)
