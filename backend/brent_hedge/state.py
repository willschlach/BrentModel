"""Persistent current hedge ratio per exposure month (JSON)."""
import json
from pathlib import Path


class HedgeState:
    def __init__(self, path=None):
        self.path = Path(path) if path else None
        self.hr = {}  # "YYYY-MM" exposure month -> hedge ratio (fraction)
        if self.path and self.path.exists():
            self.hr = json.loads(self.path.read_text())

    def get(self, exposure_month: str) -> float:
        return self.hr.get(exposure_month, 0.0)

    def set(self, exposure_month: str, value: float) -> None:
        self.hr[exposure_month] = value

    def save(self) -> None:
        if self.path:
            self.path.write_text(json.dumps(self.hr, indent=2, sort_keys=True))
