"""Black-76 pricing, forward delta, delta-to-strike, implied vol.

Delta convention (assumption A13): undiscounted forward delta, i.e. call
delta = N(d1), put delta = N(d1) - 1. Set discounted=True to multiply by the
discount factor. Confirm the LSEG convention once the data arrives.
"""
import math
from statistics import NormalDist

_N = NormalDist()


def _d1d2(F, K, vol, T):
    s = vol * math.sqrt(T)
    d1 = (math.log(F / K) + 0.5 * s * s) / s
    return d1, d1 - s


def price(F, K, vol, T, is_call=True, r=0.0):
    """Black-76 option price on a forward/futures."""
    df = math.exp(-r * T)
    if T <= 0 or vol <= 0:
        intrinsic = max(F - K, 0.0) if is_call else max(K - F, 0.0)
        return df * intrinsic
    d1, d2 = _d1d2(F, K, vol, T)
    if is_call:
        return df * (F * _N.cdf(d1) - K * _N.cdf(d2))
    return df * (K * _N.cdf(-d2) - F * _N.cdf(-d1))


def delta(F, K, vol, T, is_call=True, r=0.0, discounted=False):
    d1, _ = _d1d2(F, K, vol, T)
    d = _N.cdf(d1) if is_call else _N.cdf(d1) - 1.0
    return d * (math.exp(-r * T) if discounted else 1.0)


def strike_from_delta(F, target_delta, vol, T, is_call=True, r=0.0, discounted=False):
    """Strike K such that delta(F, K, vol, T) == target_delta.
    target_delta positive for calls (e.g. 0.25), negative for puts (-0.25)."""
    df = math.exp(-r * T) if discounted else 1.0
    raw = target_delta / df
    d1 = _N.inv_cdf(raw if is_call else raw + 1.0)
    s = vol * math.sqrt(T)
    return F * math.exp(-d1 * s + 0.5 * s * s)


def implied_vol(mkt_price, F, K, T, is_call=True, r=0.0, lo=1e-4, hi=5.0, tol=1e-10):
    """Bisection implied vol. Raises if price is outside no-arbitrage bounds."""
    f_lo = price(F, K, lo, T, is_call, r) - mkt_price
    f_hi = price(F, K, hi, T, is_call, r) - mkt_price
    if f_lo > 0 or f_hi < 0:
        raise ValueError("price outside attainable range for vol in [lo, hi]")
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if price(F, K, mid, T, is_call, r) > mkt_price:
            hi = mid
        else:
            lo = mid
        if hi - lo < tol:
            break
    return 0.5 * (lo + hi)
