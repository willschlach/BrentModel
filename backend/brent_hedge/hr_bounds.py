"""HR Bounds variants (min/max hedge ratio per months-to-exposure).

Built in:
  IV : min rises 6.25pp/month from 24m to 9m (= linear buying schedule); no min
       beyond 24m; max 100%.
  I  : no min / no max.
Not known yet (deck gives only qualitative descriptions): II, III, V.
Register them from data with register_bounds_csv() once available
(csv columns: months_to_exposure,min_hr,max_hr as fractions).
"""
import csv


def _iv() -> dict:
    table = {}
    for m in range(1, 61):
        min_hr = 0.0 if m >= 25 else (25 - m) * 6.25
        table[m] = (min_hr / 100.0, 1.0)
    return table


def _i() -> dict:
    return {m: (0.0, 1.0) for m in range(1, 61)}


BOUNDS = {"IV": _iv(), "I": _i()}
HR_BOUNDS_IV = {m: v for m, v in BOUNDS["IV"].items() if 9 <= m <= 48}  # spec table


def register_bounds(variant: str, table: dict) -> None:
    BOUNDS[variant] = dict(table)


def register_bounds_csv(variant: str, path) -> None:
    with open(path, newline="") as f:
        register_bounds(variant, {int(r["months_to_exposure"]):
                                  (float(r["min_hr"]), float(r["max_hr"]))
                                  for r in csv.DictReader(f)})


def bounds_available(variant: str) -> bool:
    return variant in BOUNDS


def get_bounds(months_to_exposure: int, variant: str = "IV") -> tuple:
    if variant not in BOUNDS:
        raise NotImplementedError(f"HR bounds '{variant}' not registered")
    table = BOUNDS[variant]
    if months_to_exposure not in table:
        raise ValueError(f"months_to_exposure {months_to_exposure} not in '{variant}'")
    return table[months_to_exposure]
