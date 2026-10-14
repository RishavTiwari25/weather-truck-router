"""
MET Norway Locationforecast client (fallback weather provider).

Free, no API key, global coverage. One location per request, so this is
slower than Open-Meteo's batched endpoint; it is used when Open-Meteo rejects
us (its free quota is per outbound IP, which is shared on most PaaS hosts).

Output is normalised to the same HourlySeries shape as the Open-Meteo client:
mph, inches per hour, Fahrenheit, WMO weather codes, hourly UTC timestamps.
"""
from __future__ import annotations

import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Sequence

from django.conf import settings

from ..exceptions import UpstreamError
from .http import session, timeout
from .series import HourlySeries

log = logging.getLogger(__name__)

MAX_CONCURRENT = 12  # met.no allows 20 req/s; keep well under with ~1 s latency
GUST_FACTOR = 1.4  # met.no has no gust field outside the Nordics; typical gust/mean ratio
SNOW_RATIO = 10.0  # inches of snow per inch of liquid-equivalent precipitation

MPS_TO_MPH = 2.236936
MM_TO_IN = 1 / 25.4

_gate = threading.BoundedSemaphore(MAX_CONCURRENT)

# met.no symbol_code -> WMO code used by the UI. Suffixes (_day/_night/_polartwilight) are stripped.
_SYMBOL_TO_WMO = {
    "clearsky": 0,
    "fair": 1,
    "partlycloudy": 2,
    "cloudy": 3,
    "fog": 45,
    "lightrain": 61,
    "rain": 63,
    "heavyrain": 65,
    "lightrainshowers": 80,
    "rainshowers": 81,
    "heavyrainshowers": 82,
    "lightsleet": 66,
    "sleet": 67,
    "heavysleet": 67,
    "lightsleetshowers": 66,
    "sleetshowers": 67,
    "heavysleetshowers": 67,
    "lightsnow": 71,
    "snow": 73,
    "heavysnow": 75,
    "lightsnowshowers": 85,
    "snowshowers": 85,
    "heavysnowshowers": 86,
    "lightrainandthunder": 95,
    "rainandthunder": 95,
    "heavyrainandthunder": 95,
    "lightrainshowersandthunder": 95,
    "rainshowersandthunder": 95,
    "heavyrainshowersandthunder": 95,
    "lightsleetandthunder": 95,
    "sleetandthunder": 95,
    "heavysleetandthunder": 95,
    "lightssleetshowersandthunder": 95,
    "sleetshowersandthunder": 95,
    "heavysleetshowersandthunder": 95,
    "lightsnowandthunder": 95,
    "snowandthunder": 95,
    "heavysnowandthunder": 95,
    "lightsnowshowersandthunder": 95,
    "snowshowersandthunder": 95,
    "heavysnowshowersandthunder": 95,
}


def _wmo(symbol: str | None) -> int:
    if not symbol:
        return 0
    base = symbol.split("_")[0]
    return _SYMBOL_TO_WMO.get(base, 3)


def _snow_fraction(symbol: str | None) -> float:
    """Share of the precipitation that falls as snow, judged from the symbol."""
    if not symbol:
        return 0.0
    if "snow" in symbol:
        return 1.0
    if "sleet" in symbol:
        return 0.5
    return 0.0


def _iso_to_ts(value: str) -> int:
    return int(datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp())


def parse(payload: dict) -> HourlySeries:
    """
    Resample met.no's timeseries (hourly for ~2.5 days, then 6-hourly) onto a
    strict hourly grid. Instant values are carried forward from the latest
    entry at or before each hour; precipitation uses the 1-hour block when
    present, otherwise the 6-hour block divided by six.
    """
    entries = payload["properties"]["timeseries"]
    if not entries:
        raise UpstreamError("MET Norway", "empty timeseries")
    stamped = [(_iso_to_ts(e["time"]), e["data"]) for e in entries]
    stamped.sort(key=lambda p: p[0])

    first, last = stamped[0][0], stamped[-1][0]
    first -= first % 3600
    n_hours = max(2, (last - first) // 3600 + 1)

    times, wind, gust, rain, snow, temp, code, vis = [], [], [], [], [], [], [], []
    cursor = 0
    for h in range(n_hours):
        ts = first + h * 3600
        while cursor + 1 < len(stamped) and stamped[cursor + 1][0] <= ts:
            cursor += 1
        data = stamped[cursor][1]
        inst = data.get("instant", {}).get("details", {})
        block = data.get("next_1_hours") or data.get("next_6_hours") or data.get("next_12_hours") or {}
        hours_in_block = 1 if "next_1_hours" in data else 6 if "next_6_hours" in data else 12
        precip_mm = float(block.get("details", {}).get("precipitation_amount", 0.0) or 0.0) / hours_in_block
        symbol = block.get("summary", {}).get("symbol_code")
        snow_share = _snow_fraction(symbol)
        liquid_in = precip_mm * MM_TO_IN

        w_mph = float(inst.get("wind_speed", 0.0) or 0.0) * MPS_TO_MPH
        g = inst.get("wind_speed_of_gust")
        g_mph = float(g) * MPS_TO_MPH if g is not None else w_mph * GUST_FACTOR
        fog = float(inst.get("fog_area_fraction", 0.0) or 0.0)

        times.append(ts)
        wind.append(round(w_mph, 2))
        gust.append(round(g_mph, 2))
        rain.append(round(liquid_in * (1 - snow_share), 4))
        snow.append(round(liquid_in * snow_share * SNOW_RATIO, 4))
        temp.append(round(float(inst.get("air_temperature", 15.0) or 0.0) * 9 / 5 + 32, 1))
        code.append(_wmo(symbol))
        vis.append(1_000.0 if fog >= 50 else 24_000.0)

    return HourlySeries(times, wind, gust, rain, snow, temp, code, vis)


def _fetch_point(lat: float, lon: float) -> HourlySeries:
    # met.no asks for at most 4 decimals, and a User-Agent that identifies the app.
    params = {"lat": f"{lat:.4f}", "lon": f"{lon:.4f}"}
    try:
        with _gate:
            resp = session().get(settings.METNO_URL, params=params, timeout=timeout())
    except Exception as exc:  # network layer
        raise UpstreamError("MET Norway", str(exc)) from exc
    if resp.status_code != 200:
        raise UpstreamError("MET Norway", f"HTTP {resp.status_code}: {resp.text[:160]}")
    try:
        return parse(resp.json())
    except (KeyError, ValueError) as exc:
        raise UpstreamError("MET Norway", f"unexpected response: {exc}") from exc


def fetch_points(points: Sequence[tuple[float, float]]) -> list[HourlySeries]:
    """One request per point, in parallel. Caching is handled by the caller."""
    if not points:
        return []
    with ThreadPoolExecutor(max_workers=min(MAX_CONCURRENT, len(points))) as pool:
        return list(pool.map(lambda p: _fetch_point(*p), points))
