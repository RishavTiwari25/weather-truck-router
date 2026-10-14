"""
Routing providers and alternative-route generation.

Providers return a normalised `Route` with per-vertex cumulative distance and
time, which the sampler needs to place checkpoints and estimate ETAs.

* OpenRouteService (truck profile `driving-hgv`, native alternatives) when an
  API key is configured.
* Public OSRM demo server otherwise (car profile; durations are scaled by a
  configurable factor to approximate heavy-vehicle speeds).

If a provider returns fewer than the requested number of alternatives, extra
options are synthesised by routing through lateral via-points and discarding
near-duplicates, so the user reliably gets three distinct corridors.
"""
from __future__ import annotations

import logging
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

from django.conf import settings

from ..exceptions import RoutingError, UpstreamError
from . import geo
from .geo import LonLat
from .http import session, timeout

log = logging.getLogger(__name__)

OSRM_TRUCK_DURATION_FACTOR = float(os.getenv("OSRM_TRUCK_DURATION_FACTOR", "1.15"))
DUPLICATE_SHARE = 0.8  # >= this fraction of shared vertices -> same route
MAX_DETOUR_RATIO = 1.5  # synthetic routes longer than this x fastest are dropped
VIA_OFFSETS = (0.12, -0.12, 0.22, -0.22)  # fraction of straight-line distance


@dataclass
class Route:
    provider: str
    coords: list[LonLat]
    cum_dist_m: list[float]
    cum_time_s: list[float]
    distance_m: float
    duration_s: float
    synthetic: bool = False
    via: LonLat | None = None
    label: str = ""
    meta: dict = field(default_factory=dict)

    @property
    def distance_mi(self) -> float:
        return geo.meters_to_miles(self.distance_m)


# --------------------------------------------------------------------------- #
# Normalisation helpers
# --------------------------------------------------------------------------- #
def _scale(values: list[float], target_total: float) -> list[float]:
    """Scale a cumulative series so its last value equals the provider total."""
    if not values or values[-1] <= 0 or target_total <= 0:
        return values
    k = target_total / values[-1]
    return [v * k for v in values]


def _time_from_steps(coords: list[LonLat], cum_dist: list[float], steps: list[tuple[int, int, float]]) -> list[float]:
    """
    Build cumulative time per vertex from (start_idx, end_idx, duration_s)
    steps, distributing each step's duration proportionally to distance.
    """
    cum_time = [0.0] * len(coords)
    for start, end, duration in steps:
        end = min(end, len(coords) - 1)
        span = cum_dist[end] - cum_dist[start]
        for i in range(start + 1, end + 1):
            frac = 1.0 if span <= 0 else (cum_dist[i] - cum_dist[start]) / span
            cum_time[i] = cum_time[start] + duration * frac
    # Fill any vertices not covered by steps (defensive).
    for i in range(1, len(cum_time)):
        if cum_time[i] < cum_time[i - 1]:
            cum_time[i] = cum_time[i - 1]
    return cum_time


# --------------------------------------------------------------------------- #
# OpenRouteService
# --------------------------------------------------------------------------- #
def _ors_request(waypoints: list[LonLat], alternatives: int) -> list[Route]:
    body: dict = {
        "coordinates": [[lon, lat] for lon, lat in waypoints],
        "instructions": True,
        "geometry_simplify": False,
        "preference": "recommended",
    }
    if alternatives > 1 and len(waypoints) == 2:
        body["alternative_routes"] = {"target_count": alternatives, "weight_factor": 1.6, "share_factor": 0.6}
    try:
        resp = session().post(
            f"{settings.ORS_BASE_URL}/v2/directions/driving-hgv/geojson",
            json=body,
            headers={"Authorization": settings.ORS_API_KEY, "Content-Type": "application/json"},
            timeout=timeout(),
        )
    except Exception as exc:
        raise UpstreamError("OpenRouteService", str(exc)) from exc
    if resp.status_code != 200:
        try:
            msg = resp.json().get("error", {}).get("message", resp.text[:200])
        except ValueError:
            msg = resp.text[:200]
        raise UpstreamError("OpenRouteService", f"HTTP {resp.status_code}: {msg}")

    routes: list[Route] = []
    for feat in resp.json().get("features", []):
        coords = [tuple(c[:2]) for c in feat["geometry"]["coordinates"]]
        props = feat["properties"]
        summary = props["summary"]
        cum_dist = geo.cumulative_distances_m(coords)
        steps = [
            (s["way_points"][0], s["way_points"][1], float(s["duration"]))
            for seg in props.get("segments", [])
            for s in seg.get("steps", [])
        ]
        cum_time = _time_from_steps(coords, cum_dist, steps) if steps else _scale(cum_dist[:], float(summary["duration"]))
        routes.append(
            Route(
                provider="openrouteservice",
                coords=coords,
                cum_dist_m=_scale(cum_dist, float(summary["distance"])),
                cum_time_s=_scale(cum_time, float(summary["duration"])),
                distance_m=float(summary["distance"]),
                duration_s=float(summary["duration"]),
                meta={"profile": "driving-hgv"},
            )
        )
    return routes


# --------------------------------------------------------------------------- #
# OSRM
# --------------------------------------------------------------------------- #
def _osrm_request(waypoints: list[LonLat], alternatives: int) -> list[Route]:
    path = ";".join(f"{lon:.6f},{lat:.6f}" for lon, lat in waypoints)
    params = {
        "alternatives": str(alternatives) if alternatives > 1 else "false",
        "overview": "full",
        "geometries": "geojson",
        "steps": "false",
        "annotations": "distance,duration",
    }
    try:
        resp = session().get(f"{settings.OSRM_BASE_URL}/route/v1/driving/{path}", params=params, timeout=timeout())
    except Exception as exc:
        raise UpstreamError("OSRM", str(exc)) from exc
    data = resp.json() if resp.content else {}
    if resp.status_code != 200 or data.get("code") != "Ok":
        raise UpstreamError("OSRM", data.get("message") or f"HTTP {resp.status_code}")

    routes: list[Route] = []
    for r in data.get("routes", []):
        coords = [tuple(c[:2]) for c in r["geometry"]["coordinates"]]
        seg_d: list[float] = []
        seg_t: list[float] = []
        for leg in r.get("legs", []):
            ann = leg.get("annotation", {})
            seg_d.extend(ann.get("distance", []))
            seg_t.extend(ann.get("duration", []))

        if len(seg_d) == len(coords) - 1 and len(seg_t) == len(coords) - 1:
            cum_dist = [0.0]
            cum_time = [0.0]
            for d, t in zip(seg_d, seg_t):
                cum_dist.append(cum_dist[-1] + float(d))
                cum_time.append(cum_time[-1] + float(t))
        else:  # annotation/geometry mismatch: fall back to proportional timing
            cum_dist = geo.cumulative_distances_m(coords)
            cum_time = cum_dist[:]

        duration = float(r["duration"]) * OSRM_TRUCK_DURATION_FACTOR
        routes.append(
            Route(
                provider="osrm",
                coords=coords,
                cum_dist_m=_scale(cum_dist, float(r["distance"])),
                cum_time_s=_scale(cum_time, duration),
                distance_m=float(r["distance"]),
                duration_s=duration,
                meta={"profile": "driving (car) x%.2f truck factor" % OSRM_TRUCK_DURATION_FACTOR},
            )
        )
    return routes


def _provider():
    return _ors_request if settings.ORS_API_KEY else _osrm_request


# --------------------------------------------------------------------------- #
# Alternatives
# --------------------------------------------------------------------------- #
def _is_duplicate(candidate: Route, existing: list[Route]) -> bool:
    cand = geo.downsample(candidate.coords, 3000)
    for other in existing:
        share = geo.shared_fraction(cand, geo.downsample(other.coords, 3000), tolerance_m=1500)
        if share >= DUPLICATE_SHARE:
            return True
    return False


def _via_candidates(origin: LonLat, destination: LonLat) -> list[LonLat]:
    straight = geo.haversine_m(origin, destination)
    mid = geo.interpolate(origin, destination, 0.5)
    bearing = geo.initial_bearing(origin, destination)
    vias = []
    for frac in VIA_OFFSETS:
        side = 90 if frac > 0 else -90
        vias.append(geo.destination_point(mid, bearing + side, abs(frac) * straight))
    return vias


def fetch_routes(origin: LonLat, destination: LonLat, want: int = 3) -> list[Route]:
    """Return up to `want` distinct routes, fastest first, labelled A, B, C..."""
    request = _provider()
    primary = request([origin, destination], want)
    if not primary:
        raise RoutingError("No route could be found between these locations.")

    routes: list[Route] = []
    for r in sorted(primary, key=lambda x: x.duration_s):
        if not _is_duplicate(r, routes):
            routes.append(r)

    if len(routes) < want:
        vias = _via_candidates(origin, destination)

        def attempt(via: LonLat) -> Route | None:
            try:
                found = request([origin, via, destination], 1)
            except UpstreamError as exc:
                log.warning("via-point routing failed: %s", exc)
                return None
            if not found:
                return None
            r = found[0]
            r.synthetic = True
            r.via = via
            return r

        with ThreadPoolExecutor(max_workers=len(vias)) as pool:
            candidates = [c for c in pool.map(attempt, vias) if c]

        fastest = routes[0].duration_s
        for c in sorted(candidates, key=lambda x: x.duration_s):
            if len(routes) >= want:
                break
            if c.duration_s > fastest * MAX_DETOUR_RATIO:
                continue
            if not _is_duplicate(c, routes):
                routes.append(c)

    routes.sort(key=lambda x: x.duration_s)
    for i, r in enumerate(routes[:want]):
        r.label = chr(ord("A") + i)
    return routes[:want]
