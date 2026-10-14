"""
Geocoding with a provider chain: OpenRouteService (if key) -> Nominatim -> Photon.
Raw "lat, lon" input is accepted directly. Results are cached for a day.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from django.conf import settings
from django.core.cache import cache

from ..exceptions import GeocodingError
from .http import session, timeout

log = logging.getLogger(__name__)

COORD_RE = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$")


@dataclass(frozen=True)
class Place:
    query: str
    label: str
    lat: float
    lon: float
    provider: str

    def as_dict(self) -> dict:
        return {"query": self.query, "label": self.label, "lat": self.lat, "lon": self.lon, "provider": self.provider}


def _ors(query: str) -> Place | None:
    if not settings.ORS_API_KEY:
        return None
    resp = session().get(
        f"{settings.ORS_BASE_URL}/geocode/search",
        params={"api_key": settings.ORS_API_KEY, "text": query, "size": 1},
        timeout=timeout(),
    )
    if resp.status_code != 200:
        log.warning("ORS geocode HTTP %s", resp.status_code)
        return None
    feats = resp.json().get("features") or []
    if not feats:
        return None
    lon, lat = feats[0]["geometry"]["coordinates"]
    return Place(query, feats[0]["properties"].get("label", query), lat, lon, "openrouteservice")


def _nominatim(query: str) -> Place | None:
    resp = session().get(
        f"{settings.NOMINATIM_URL}/search",
        params={"q": query, "format": "jsonv2", "limit": 1, "addressdetails": 0},
        timeout=timeout(),
    )
    if resp.status_code != 200:
        log.warning("Nominatim HTTP %s", resp.status_code)
        return None
    items = resp.json()
    if not items:
        return None
    hit = items[0]
    return Place(query, hit.get("display_name", query), float(hit["lat"]), float(hit["lon"]), "nominatim")


def _photon(query: str) -> Place | None:
    resp = session().get(f"{settings.PHOTON_URL}/api/", params={"q": query, "limit": 1}, timeout=timeout())
    if resp.status_code != 200:
        log.warning("Photon HTTP %s", resp.status_code)
        return None
    feats = resp.json().get("features") or []
    if not feats:
        return None
    props = feats[0]["properties"]
    lon, lat = feats[0]["geometry"]["coordinates"]
    label = ", ".join(p for p in [props.get("name"), props.get("state"), props.get("country")] if p)
    return Place(query, label or query, lat, lon, "photon")


PROVIDERS = (_ors, _nominatim, _photon)


def geocode(query: str) -> Place:
    query = query.strip()
    if not query:
        raise GeocodingError("Empty location.")

    m = COORD_RE.match(query)
    if m:
        lat, lon = float(m.group(1)), float(m.group(2))
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise GeocodingError(f"Coordinates out of range: {query}")
        return Place(query, f"{lat:.4f}, {lon:.4f}", lat, lon, "coordinates")

    key = f"geo:{query.lower()}"
    cached = cache.get(key)
    if cached:
        return cached

    errors: list[str] = []
    for provider in PROVIDERS:
        try:
            place = provider(query)
        except Exception as exc:  # network / parsing: try the next provider
            errors.append(f"{provider.__name__.strip('_')}: {exc}")
            continue
        if place:
            cache.set(key, place, settings.GEOCODE_CACHE_SECONDS)
            return place

    detail = f" ({'; '.join(errors)})" if errors else ""
    raise GeocodingError(f"Could not find a location for '{query}'. Try adding a state or country.{detail}")
