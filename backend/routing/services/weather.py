"""
Open-Meteo client. Fetches hourly forecasts for many points in one request,
caches per point, and interpolates values at arbitrary timestamps.
"""
from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Sequence

from django.conf import settings
from django.core.cache import cache

from ..exceptions import UpstreamError
from .http import session, timeout

log = logging.getLogger(__name__)

HOURLY_VARS = [
    "wind_speed_10m",
    "wind_gusts_10m",
    "rain",
    "showers",
    "snowfall",
    "temperature_2m",
    "weather_code",
    "visibility",
]
CHUNK = 40  # points per upstream request
MAX_CONCURRENT = 3  # Open-Meteo rejects bursts with "Too many concurrent requests"
CACHE_PRECISION = 2  # ~1.1 km, far below forecast model resolution

_gate = threading.BoundedSemaphore(MAX_CONCURRENT)


@dataclass
class HourlySeries:
    times: list[int]  # unix seconds, hourly, UTC
    wind_mph: list[float]
    gust_mph: list[float]
    rain_in: list[float]  # liquid (rain + showers) per hour
    snow_in: list[float]
    temp_f: list[float]
    code: list[int]
    visibility_m: list[float]

    def index_for(self, ts: int) -> tuple[int, float]:
        """Fractional position of `ts` in the hourly grid, clamped to range."""
        n = len(self.times)
        if n < 2:
            return 0, 0.0
        pos = (ts - self.times[0]) / 3600
        if pos <= 0:
            return 0, 0.0
        if pos >= n - 1:
            return n - 2, 1.0
        i = int(pos)
        return i, pos - i

    def at(self, ts: int) -> dict:
        """Linearly interpolate conditions at a unix timestamp."""
        if not self.times:
            raise ValueError("empty series")
        i, f = self.index_for(ts)
        j = min(i + 1, len(self.times) - 1)

        def lerp(arr: list[float]) -> float:
            return arr[i] + (arr[j] - arr[i]) * f

        nearest = i if f < 0.5 else j
        return {
            "wind_mph": round(lerp(self.wind_mph), 1),
            "gust_mph": round(lerp(self.gust_mph), 1),
            "rain_in_hr": round(lerp(self.rain_in), 3),
            "snow_in_hr": round(lerp(self.snow_in), 2),
            "temp_f": round(lerp(self.temp_f), 1),
            "weather_code": int(self.code[nearest]),
            "visibility_m": round(lerp(self.visibility_m), 0),
            "forecast_hour": self.times[nearest],
        }


def _key(lat: float, lon: float, days: int) -> str:
    return f"om:{round(lat, CACHE_PRECISION)}:{round(lon, CACHE_PRECISION)}:{days}"


def _clean(values: list, default: float = 0.0) -> list[float]:
    return [default if v is None else float(v) for v in values]


def _parse(item: dict) -> HourlySeries:
    h = item["hourly"]
    rain = _clean(h.get("rain", []))
    showers = _clean(h.get("showers", []))
    return HourlySeries(
        times=[int(t) for t in h["time"]],
        wind_mph=_clean(h["wind_speed_10m"]),
        gust_mph=_clean(h.get("wind_gusts_10m", [])),
        rain_in=[round(r + s, 4) for r, s in zip(rain, showers)],
        snow_in=_clean(h.get("snowfall", [])),
        temp_f=_clean(h.get("temperature_2m", [])),
        code=[int(c or 0) for c in h.get("weather_code", [])],
        visibility_m=_clean(h.get("visibility", []), default=24_000.0),
    )


def _fetch_chunk(points: Sequence[tuple[float, float]], days: int) -> list[HourlySeries]:
    params = {
        "latitude": ",".join(f"{lat:.4f}" for lat, _ in points),
        "longitude": ",".join(f"{lon:.4f}" for _, lon in points),
        "hourly": ",".join(HOURLY_VARS),
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "temperature_unit": "fahrenheit",
        "timezone": "UTC",
        "timeformat": "unixtime",
        "forecast_days": days,
    }
    for attempt in range(3):
        try:
            with _gate:
                resp = session().get(settings.OPEN_METEO_URL, params=params, timeout=timeout())
        except Exception as exc:  # network layer
            raise UpstreamError("Open-Meteo", str(exc)) from exc
        if resp.status_code != 429:
            break
        log.warning("Open-Meteo 429, backing off (attempt %d)", attempt + 1)
        time.sleep(1.5 * (attempt + 1))
    if resp.status_code != 200:
        reason = resp.text[:200]
        try:
            reason = resp.json().get("reason", reason)
        except ValueError:
            pass
        raise UpstreamError("Open-Meteo", f"HTTP {resp.status_code}: {reason}")
    data = resp.json()
    items = data if isinstance(data, list) else [data]
    if len(items) != len(points):
        raise UpstreamError("Open-Meteo", "response length mismatch")
    return [_parse(item) for item in items]


def fetch_hourly(points: Sequence[tuple[float, float]], days: int = 3) -> list[HourlySeries]:
    """
    Hourly forecast series for each (lat, lon). Uses the cache where possible
    and fans out uncached points to Open-Meteo in parallel chunks.
    """
    days = max(1, min(16, days))
    result: list[HourlySeries | None] = [None] * len(points)
    missing: dict[str, list[int]] = {}
    for idx, (lat, lon) in enumerate(points):
        key = _key(lat, lon, days)
        hit = cache.get(key)
        if hit is not None:
            result[idx] = hit
        else:
            missing.setdefault(key, []).append(idx)

    unique_keys = list(missing.keys())
    unique_points = [points[missing[k][0]] for k in unique_keys]
    chunks = [unique_points[i : i + CHUNK] for i in range(0, len(unique_points), CHUNK)]
    log.info(
        "Open-Meteo: %d points requested, %d uncached, %d upstream calls",
        len(points), len(unique_points), len(chunks),
    )

    if chunks:
        with ThreadPoolExecutor(max_workers=min(MAX_CONCURRENT, len(chunks))) as pool:
            fetched = list(pool.map(lambda c: _fetch_chunk(c, days), chunks))
        flat = [series for chunk in fetched for series in chunk]
        for key, series in zip(unique_keys, flat):
            cache.set(key, series, settings.WEATHER_CACHE_SECONDS)
            for idx in missing[key]:
                result[idx] = series
    return result  # type: ignore[return-value]


def days_needed(latest_ts: int, now_ts: int) -> int:
    """Forecast days so the hourly series covers `latest_ts` with a buffer."""
    horizon_h = max(0.0, (latest_ts - now_ts) / 3600)
    return int(min(16, max(3, horizon_h // 24 + 2)))
