"""
Weather provider front door.

Primary: Open-Meteo (batched, fast, no key). Its free quota is counted per
outbound IP, which is shared with other tenants on most PaaS hosts, so a
"Daily API request limit exceeded" can arrive through no fault of ours.
When that happens (and WEATHER_PROVIDER=auto) we switch to MET Norway for a
cool-down period and keep serving. Both providers are normalised to the same
HourlySeries, so nothing downstream changes.
"""
from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Sequence

from django.conf import settings
from django.core.cache import cache

from ..exceptions import UpstreamError
from . import metno
from .http import session, timeout
from .series import HourlySeries

__all__ = ["HourlySeries", "fetch_hourly", "days_needed", "active_provider", "PROVIDER_LABELS"]

log = logging.getLogger(__name__)

OPEN_METEO = "open-meteo"
METNO = "metno"
PROVIDER_LABELS = {OPEN_METEO: "Open-Meteo", METNO: "MET Norway"}

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
FALLBACK_KEY = "weather:open-meteo-down-until"

_gate = threading.BoundedSemaphore(MAX_CONCURRENT)


class QuotaExceeded(UpstreamError):
    """Open-Meteo refused us for the rest of the minute/hour/day."""


# --- provider selection ------------------------------------------------------


def active_provider() -> str:
    """Which provider the next request will use."""
    configured = settings.WEATHER_PROVIDER
    if configured in (OPEN_METEO, METNO):
        return configured
    return METNO if cache.get(FALLBACK_KEY) else OPEN_METEO


def _enter_fallback(reason: str) -> None:
    log.warning("Open-Meteo unavailable (%s); using MET Norway for %ds", reason, settings.WEATHER_FALLBACK_SECONDS)
    cache.set(FALLBACK_KEY, int(time.time()), settings.WEATHER_FALLBACK_SECONDS)


# --- Open-Meteo --------------------------------------------------------------


def _clean(values: list, default: float = 0.0) -> list[float]:
    return [default if v is None else float(v) for v in values]


def _parse_open_meteo(item: dict) -> HourlySeries:
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
        reason = _reason(resp)
        if "limit exceeded" in reason.lower():
            raise QuotaExceeded("Open-Meteo", f"HTTP 429: {reason}")  # retrying will not help
        log.warning("Open-Meteo 429 (%s), backing off (attempt %d)", reason, attempt + 1)
        time.sleep(1.5 * (attempt + 1))
    if resp.status_code != 200:
        raise UpstreamError("Open-Meteo", f"HTTP {resp.status_code}: {_reason(resp)}")
    data = resp.json()
    items = data if isinstance(data, list) else [data]
    if len(items) != len(points):
        raise UpstreamError("Open-Meteo", "response length mismatch")
    return [_parse_open_meteo(item) for item in items]


def _reason(resp) -> str:
    try:
        return str(resp.json().get("reason", resp.text[:200]))
    except ValueError:
        return resp.text[:200]


def _fetch_open_meteo(points: Sequence[tuple[float, float]], days: int) -> list[HourlySeries]:
    chunks = [points[i : i + CHUNK] for i in range(0, len(points), CHUNK)]
    with ThreadPoolExecutor(max_workers=min(MAX_CONCURRENT, len(chunks))) as pool:
        fetched = list(pool.map(lambda c: _fetch_chunk(c, days), chunks))
    return [series for chunk in fetched for series in chunk]


# --- public API --------------------------------------------------------------


def _key(provider: str, lat: float, lon: float, days: int) -> str:
    return f"wx:{provider}:{round(lat, CACHE_PRECISION)}:{round(lon, CACHE_PRECISION)}:{days}"


def fetch_hourly(points: Sequence[tuple[float, float]], days: int = 3) -> list[HourlySeries]:
    """
    Hourly forecast series for each (lat, lon), from the active provider.
    Cached per point; uncached points are fetched in parallel. If Open-Meteo
    reports its quota is exhausted, falls back to MET Norway transparently.
    """
    days = max(1, min(16, days))
    provider = active_provider()
    result, missing = _from_cache(points, days, provider)
    unique_keys = list(missing.keys())
    unique_points = [points[missing[k][0]] for k in unique_keys]
    log.info("weather(%s): %d points, %d uncached", provider, len(points), len(unique_points))

    if unique_points:
        try:
            fetched = _fetch_open_meteo(unique_points, days) if provider == OPEN_METEO else metno.fetch_points(unique_points)
        except QuotaExceeded as exc:
            if settings.WEATHER_PROVIDER != "auto":
                raise
            _enter_fallback(str(exc.detail))
            provider = METNO
            result, missing = _from_cache(points, days, provider)
            unique_keys = list(missing.keys())
            unique_points = [points[missing[k][0]] for k in unique_keys]
            fetched = metno.fetch_points(unique_points)
        for key, series in zip(unique_keys, fetched):
            cache.set(key, series, settings.WEATHER_CACHE_SECONDS)
            for idx in missing[key]:
                result[idx] = series
    return result  # type: ignore[return-value]


def _from_cache(points, days: int, provider: str):
    result: list[HourlySeries | None] = [None] * len(points)
    missing: dict[str, list[int]] = {}
    for idx, (lat, lon) in enumerate(points):
        key = _key(provider, lat, lon, days)
        hit = cache.get(key)
        if hit is not None:
            result[idx] = hit
        else:
            missing.setdefault(key, []).append(idx)
    return result, missing


def days_needed(latest_ts: int, now_ts: int) -> int:
    """Forecast days so the hourly series covers `latest_ts` with a buffer."""
    horizon_h = max(0.0, (latest_ts - now_ts) / 3600)
    return int(min(16, max(3, horizon_h // 24 + 2)))
