"""Monthly inception run -> GS-format output table.

Usage:
  python -m brent_hedge.run_monthly --data DIR --date 2026-11-02 \
      [--state state.json] [--out signals.csv] [--synthetic]
"""
import argparse

import pandas as pd

from .allocation import allocate
from .config import ModelConfig
from .data import DataProvider, make_synthetic
from .engine import SignalEngine
from .state import HedgeState

COLUMNS = {
    "inception": "Inception Date", "exposure": "Exposure Date",
    "contract": "Contract Month", "m": "Months to Exposure",
    "val": "Valuation Signal", "min_hr": "Min HR", "max_hr": "Max HR",
    "target": "Rounded Target HR", "current": "Current HR",
    "incr": "Incremental HR", "ivp": "IV Percentile",
    "futfrac": "Futures Fraction", "skewp": "Skew Percentile",
    "instrument": "Instrument", "fut": "Rounded Futures %",
    "opt": "Rounded Options %", "col": "Rounded Collars %",
    "ifut": "Incr Futures", "iopt": "Incr Options", "icol": "Incr Collars",
}


def run(provider: DataProvider, inception, cfg: ModelConfig, state: HedgeState,
        update_state: bool = True) -> pd.DataFrame:
    inception = pd.Timestamp(inception)
    eng = SignalEngine(provider, cfg)
    snap = eng.snapshot(inception)
    near_val = eng.valuation_at(inception)

    rows = []
    for m in range(cfg.min_tenor_months, cfg.max_tenor_months + 1):
        exposure = inception + pd.DateOffset(months=m)
        exp_month = exposure.to_period("M")
        contract = str(exp_month + cfg.contract_month_offset)

        if cfg.valuation_use_target_contract:
            price = provider.contract_price(inception, contract)
            if price is None:
                raise KeyError(f"No curve price for {contract} on {inception.date()}")
            val = eng.valuation_at(inception, price)

        cur = state.get(str(exp_month))
        a = allocate(m, val, snap["momentum"], snap["iv_pct"], snap["skew_pct"], cur, cfg)
        rows.append({
            "inception": inception.date(), "exposure": exposure.date(),
            "contract": contract, "m": m, "val": a.valuation_signal,
            "min_hr": a.min_hr, "max_hr": a.max_hr, "target": a.target_hr,
            "current": a.current_hr, "incr": a.incremental_hr, "ivp": a.iv_percentile,
            "futfrac": a.futures_fraction_raw, "skewp": a.skew_percentile,
            "instrument": a.instrument, "fut": a.futures_pct, "opt": a.options_pct,
            "col": a.collars_pct, "ifut": a.incr_futures, "iopt": a.incr_options,
            "icol": a.incr_collars,
        })
        if update_state:
            state.set(str(exp_month), cur + a.incremental_hr)

    return pd.DataFrame(rows).rename(columns=COLUMNS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", help="directory with nearby.csv, vol.csv, curve.csv")
    ap.add_argument("--synthetic", action="store_true")
    ap.add_argument("--date", required=True)
    ap.add_argument("--state", default=None)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    cfg = ModelConfig()
    if args.synthetic:
        provider = make_synthetic(end=args.date)
    else:
        provider = DataProvider.from_csv_dir(args.data)
    state = HedgeState(args.state)
    df = run(provider, args.date, cfg, state)
    state.save()
    if args.out:
        df.to_csv(args.out, index=False)
    else:
        print(df.to_string(index=False))


if __name__ == "__main__":
    main()
