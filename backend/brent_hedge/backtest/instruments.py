"""Instrument pricing and settlement-cost functions for the backtest.

Approximation (A17): a flat 15m vol per instrument family is applied to all
tenors (ATMF vol for ATM options, 25d call vol for 25d calls, 25d put vol for
the collar put). Replace with strike/tenor-specific vols once chain data exists.
Premiums are mid, no bid-ask or transaction costs (A18).
"""
from dataclasses import dataclass

from .. import pricing


@dataclass
class Leg:
    kind: str            # "FUT" | "CALL" | "COLLAR"
    size: float          # fraction of exposure
    strike: float        # futures price / call strike
    premium: float = 0.0  # net premium paid per unit (call) / net (collar)
    put_strike: float = 0.0

    def unit_cost(self, settle: float) -> float:
        """Effective price paid per unit of exposure given final settlement."""
        if self.kind == "FUT":
            return self.strike
        if self.kind == "CALL":
            return min(settle, self.strike) + self.premium
        return min(max(settle, self.put_strike), self.strike) + self.premium


def make_call(F, T, vols, option_type, size) -> Leg:
    if option_type == "atmf":
        vol, K = vols["atmf_iv_15m"], F
    else:
        vol = vols["call_iv_25d"]
        K = pricing.strike_from_delta(F, 0.25, vol, T, True)
    return Leg("CALL", size, K, pricing.price(F, K, vol, T, True))


def make_collar(F, T, vols, option_type, size) -> Leg:
    """Buy call (ATMF or 25d), sell put with strike solved for zero net cost."""
    call = make_call(F, T, vols, option_type, 1.0)
    put_vol = vols["put_iv_25d"]
    lo, hi = F * 0.05, F
    if pricing.price(F, hi, put_vol, T, False) <= call.premium:
        kp = hi  # cannot fund the call fully with an ATM put: cap at ATM
    else:
        for _ in range(100):
            mid = 0.5 * (lo + hi)
            if pricing.price(F, mid, put_vol, T, False) > call.premium:
                hi = mid
            else:
                lo = mid
        kp = 0.5 * (lo + hi)
    net = call.premium - pricing.price(F, kp, put_vol, T, False)
    return Leg("COLLAR", size, call.strike, net, put_strike=kp)
