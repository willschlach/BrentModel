"""Rule-based flags shown next to the model instruction (see docs/Web_App_Design_Spec.md s5).
Flags never change the model output; they only describe how fragile or
unusual it is. Thresholds live in FlagConfig."""
from dataclasses import dataclass

import pandas as pd


@dataclass
class FlagConfig:
    stale_days: int = 3
    skew_margin_pts: float = 5.0
    rounding_margin_pts: float = 0.5
    schedule_share: float = 0.8
    large_increment_pts: float = 20.0
    long_dated_months: int = 36


def _near_boundary(value_pct: float, increment: float, margin: float) -> bool:
    """True if value sits within `margin` of a rounding boundary (x.5 increments)."""
    r = (value_pct % increment)
    return abs(r - increment / 2) <= margin


def compute_flags(rows: pd.DataFrame, run_date, last_data_date, data_source: str,
                  cfg, fcfg: FlagConfig = None) -> list:
    """rows: run_monthly.run(..., raw=True) output."""
    f = fcfg or FlagConfig()
    out = []

    def add(fid, sev, scope, msg):
        out.append({"id": fid, "severity": sev, "scope": scope, "message": msg})

    if data_source == "synthetic":
        add("DATA_SYNTHETIC", "critical", "run",
            "Data is synthetic. Outputs are for testing the application only.")
    gap = (pd.Timestamp(run_date) - pd.Timestamp(last_data_date)).days
    if gap > f.stale_days:
        add("DATA_STALE", "critical", "run",
            f"Last data point is {gap} days before the run date.")

    skew = float(rows["skewp"].iloc[0])
    if abs(skew - cfg.skew_threshold_percentile) <= f.skew_margin_pts:
        add("SKEW_NEAR_THRESHOLD", "warn", "run",
            f"Skew percentile {skew:.1f} is within {f.skew_margin_pts:g} points of "
            f"{cfg.skew_threshold_percentile:g}: calls vs collars could flip.")

    for _, r in rows.iterrows():
        m = int(r["m"])
        scope = f"{m}m"
        if m <= cfg.options_tenor_cap_months and _near_boundary(
                r["futfrac"] * 100, cfg.fraction_rounding_pct, f.rounding_margin_pts):
            add("IV_NEAR_ROUNDING", "info", scope,
                f"Raw futures share {r['futfrac']*100:.1f}% is near a rounding boundary.")
        if _near_boundary(r["rawtarget"] * 100, cfg.hr_rounding_pct, f.rounding_margin_pts):
            add("TARGET_NEAR_ROUNDING", "info", scope,
                f"Raw target {r['rawtarget']*100:.1f}% is near a rounding boundary.")
        if r["target"] > 0 and r["min_hr"] / r["target"] >= f.schedule_share:
            add("SCHEDULE_DRIVEN", "info", scope,
                f"Minimum schedule ({r['min_hr']*100:.1f}%) drives most of the "
                f"{r['target']*100:.0f}% target.")
        if r["val"] <= 0.0 or r["val"] >= 1.0:
            add("SIGNAL_AT_EXTREME", "info", scope,
                f"Valuation signal is {r['val']*100:.0f}%: price is outside the bounds.")
        if r["incr"] * 100 >= f.large_increment_pts:
            add("LARGE_INCREMENT", "warn", scope,
                f"Incremental hedge of {r['incr']*100:.0f} points in one month.")
        if m > f.long_dated_months:
            add("LONG_DATED", "info", scope,
                "Long-dated exposure: futures only, liquidity may be thin.")
    return out
