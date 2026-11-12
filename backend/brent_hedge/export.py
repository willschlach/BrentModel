"""Export one model run as a JSON snapshot for the web app.

  (run from backend/)
  python -m brent_hedge.export --synthetic
  python -m brent_hedge.export --data DIR [--out PATH]

Default output: <repo>/frontend/public/data/latest.json

Schema: docs/Web_App_Design_Spec.md section 6 (schemaVersion 1).
Synthetic output is for testing the UI only.
"""
import argparse
import json
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from .config import ModelConfig
from .data import DataProvider, make_synthetic
from .engine import SignalEngine
from .flags import compute_flags
from .run_monthly import run
from .state import HedgeState

# backend/brent_hedge/export.py -> repo root is three levels up
DEFAULT_OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data" / "latest.json"

ASSUMPTIONS = [
    ("A1", "Momentum weight (0 / 25 / 50%) is open; the preset uses valuation only", "assumed"),
    ("A2", "Minimum futures share 30% (48m spec); the 24m deck and top-20 use 50%", "assumed"),
    ("A3", "IV measured at 15-month ATMF", "confirmed"),
    ("A4", "Wilder RSI variant", "assumed"),
    ("A5", "Target contract price is compared with nearby-derived bounds", "assumed"),
    ("A6", "Risk reversal = 25d call IV minus 25d put IV; the spec's wording (low percentile = puts cheap) conflicts with this sign, to be resolved with real data", "assumed"),
    ("A8", "Contract month = exposure month + 2; expiry = last business day of month -2", "assumed"),
    ("A9", "Percentile = share at or below current, current included", "assumed"),
    ("A11", "EMA is span 2520 days, not half-life", "assumed"),
    ("A13", "Undiscounted forward delta for 25-delta options", "assumed"),
    ("A14", "Hedges are never sold down (ratchet)", "assumed"),
    ("A16", "Stochastic and short-bound parameters are placeholders", "placeholder"),
    ("A17", "Backtest option pricing uses flat vols", "placeholder"),
    ("A18", "No transaction costs or bid-ask in the backtest", "placeholder"),
]


def _weekly(s: pd.Series, years: int) -> pd.Series:
    s = s.dropna()
    s = s[s.index >= s.index[-1] - pd.DateOffset(years=years)]
    return s.resample("W-FRI").last().dropna()


def _series(s: pd.Series, nd=4) -> list:
    return [{"date": d.strftime("%Y-%m-%d"), "value": round(float(v), nd)} for d, v in s.items()]


def build_snapshot(provider: DataProvider, cfg: ModelConfig, data_source: str,
                   run_date=None, seed_months: int = 18) -> dict:
    idx = provider.nearby.index
    run_date = pd.Timestamp(run_date) if run_date is not None else idx[-1]
    run_date = idx[idx.searchsorted(run_date, side="right") - 1]

    # Seed state with prior monthly runs so current/incremental look like an
    # ongoing program (demo only: real state comes from executed hedges).
    state = HedgeState()
    for k in range(seed_months, 0, -1):
        t = (run_date - pd.DateOffset(months=k)).replace(day=cfg.inception_day)
        pos = idx.searchsorted(t)
        if pos < len(idx) and idx[pos].to_period("M") < run_date.to_period("M") \
                and idx[pos] >= idx[cfg.warmup_days]:
            run(provider, idx[pos], cfg, state, update_state=True)
    rows = run(provider, run_date, cfg, state, update_state=False, raw=True)

    eng = SignalEngine(provider, cfg)
    i = eng._pos(run_date)
    b = eng.bounds.iloc[: i + 1]
    near = provider.nearby.iloc[: i + 1]

    price_df = pd.DataFrame({"nearby": near, "ema": b["ema"], "upper": b["upper"],
                             "lower": b["lower"]})
    price_w = price_df[price_df.index >= price_df.index[-1] - pd.DateOffset(years=10)] \
        .resample("W-FRI").last().dropna()
    price_series = [{"date": d.strftime("%Y-%m-%d"), **{k: round(float(v), 3) for k, v in r.items()}}
                    for d, r in price_w.iterrows()]

    targets = []
    for m in (15, 30):
        if m in set(rows["m"]):
            r = rows[rows["m"] == m].iloc[0]
            if r["price"] is not None and not pd.isna(r["price"]):
                targets.append({"label": f"{m}m future", "contractMonth": r["contract"],
                                "price": round(float(r["price"]), 3)})

    iv = eng.iv.loc[:run_date]
    rr = eng.rr.loc[:run_date]
    rr_win = rr.dropna().iloc[-cfg.skew_lookback_days:]
    iv_pct, skew_pct = eng.iv_percentile_at(run_date), eng.skew_percentile_at(run_date)

    out_rows = []
    for _, r in rows.iterrows():
        out_rows.append({
            "exposureDate": str(r["exposure"]), "contractMonth": r["contract"],
            "monthsToExposure": int(r["m"]), "valuationSignal": float(r["val"]),
            "minHr": float(r["min_hr"]), "maxHr": float(r["max_hr"]),
            "rawTargetHr": float(r["rawtarget"]), "targetHr": float(r["target"]),
            "currentHr": float(r["current"]), "incrementalHr": float(r["incr"]),
            "ivPercentile": float(r["ivp"]), "futuresFractionRaw": float(r["futfrac"]),
            "skewPercentile": float(r["skewp"]), "instrument": r["instrument"],
            "futuresPct": float(r["fut"]), "optionsPct": float(r["opt"]),
            "collarsPct": float(r["col"]), "incrFutures": float(r["ifut"]),
            "incrOptions": float(r["iopt"]), "incrCollars": float(r["icol"]),
            "contractPrice": None if r["price"] is None else round(float(r["price"]), 3),
        })

    flags = compute_flags(rows, run_date, provider.nearby.index[-1], data_source, cfg)
    with_trades = int((rows["incr"] > 1e-12).sum())
    return {
        "schemaVersion": 1,
        "meta": {
            "runDate": run_date.strftime("%Y-%m-%d"),
            "lastDataDate": provider.nearby.index[-1].strftime("%Y-%m-%d"),
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "dataSource": data_source,
            "preset": "sep2026" if cfg.max_tenor_months == 48 else "custom",
            "config": {k: v for k, v in asdict(cfg).items()},
        },
        "summary": {
            "exposures": int(len(rows)), "withTrades": with_trades,
            "avgCurrentHr": float(rows["current"].mean()),
            "avgTargetHr": float(rows["target"].mean()),
            "incrementalByInstrument": {
                "futures": float(rows["ifut"].sum()), "options": float(rows["iopt"].sum()),
                "collars": float(rows["icol"].sum())},
        },
        "rows": out_rows,
        "signals": {
            "price": price_series, "targets": targets,
            "iv": {"series": _series(_weekly(iv, 10)), "current": round(float(iv.iloc[-1]), 4),
                   "percentile": round(iv_pct, 1), "lookbackYears": cfg.iv_lookback_days // 252},
            "rr": {"series": _series(_weekly(rr, 5)), "current": round(float(rr.iloc[-1]), 4),
                   "percentile": round(skew_pct, 1),
                   "threshold": round(float(np.percentile(
                       rr_win, cfg.skew_threshold_percentile)), 4),
                   "lookbackYears": cfg.skew_lookback_days // 252},
            "momentum": {"weight": cfg.momentum_weight},
        },
        "flags": flags,
        "dataHealth": provider.quality_report(),
        "assumptions": [{"id": a, "text": t, "status": s} for a, t, s in ASSUMPTIONS],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data")
    ap.add_argument("--synthetic", action="store_true")
    ap.add_argument("--date")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    a = ap.parse_args()
    cfg = ModelConfig()
    if a.synthetic:
        provider, source = make_synthetic(end="2026-11-10"), "synthetic"
    else:
        provider, source = DataProvider.from_csv_dir(a.data), "csv"
    snap = build_snapshot(provider, cfg, source, a.date)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(snap, indent=1, allow_nan=False))
    print(f"wrote {a.out}: {len(snap['rows'])} rows, {len(snap['flags'])} flags")


if __name__ == "__main__":
    main()
