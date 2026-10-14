"""Pure geometry helpers (no I/O). Coordinates are (lon, lat) like GeoJSON."""
from __future__ import annotations

import math
from typing import Sequence

EARTH_RADIUS_M = 6_371_008.8
METERS_PER_MILE = 1609.344

LonLat = tuple[float, float]


def haversine_m(a: LonLat, b: LonLat) -> float:
    """Great-circle distance in meters between two (lon, lat) points."""
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(h)))


def meters_to_miles(m: float) -> float:
    return m / METERS_PER_MILE


def miles_to_meters(mi: float) -> float:
    return mi * METERS_PER_MILE


def cumulative_distances_m(coords: Sequence[LonLat]) -> list[float]:
    """Running distance along a polyline, starting at 0."""
    out = [0.0]
    for i in range(1, len(coords)):
        out.append(out[-1] + haversine_m(coords[i - 1], coords[i]))
    return out


def interpolate(a: LonLat, b: LonLat, t: float) -> LonLat:
    """Linear interpolation between two nearby points (fine at road scale)."""
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def point_at_distance(coords: Sequence[LonLat], cum: Sequence[float], target_m: float) -> tuple[LonLat, int, float]:
    """
    Locate the point at `target_m` along the polyline.
    Returns (point, segment_index, fraction_within_segment).
    """
    i, t = locate(cum, target_m)
    return interpolate(coords[i], coords[i + 1], t), i, t


def value_at_distance(cum: Sequence[float], values: Sequence[float], target_m: float) -> float:
    """Interpolate an along-track quantity (e.g. elapsed seconds) at a distance."""
    i, t = locate(cum, target_m)
    return values[i] + (values[i + 1] - values[i]) * t


def locate(cum: Sequence[float], target_m: float) -> tuple[int, float]:
    """Binary-search the segment index and fraction for a distance along `cum`."""
    if target_m <= 0:
        return 0, 0.0
    if target_m >= cum[-1]:
        return len(cum) - 2, 1.0
    lo, hi = 0, len(cum) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if cum[mid] <= target_m:
            lo = mid
        else:
            hi = mid
    seg_len = cum[hi] - cum[lo]
    t = 0.0 if seg_len == 0 else (target_m - cum[lo]) / seg_len
    return lo, t


def destination_point(origin: LonLat, bearing_deg: float, distance_m: float) -> LonLat:
    """Point at a given bearing/distance from origin (spherical earth)."""
    lon1, lat1 = map(math.radians, origin)
    brg = math.radians(bearing_deg)
    d = distance_m / EARTH_RADIUS_M
    lat2 = math.asin(math.sin(lat1) * math.cos(d) + math.cos(lat1) * math.sin(d) * math.cos(brg))
    lon2 = lon1 + math.atan2(
        math.sin(brg) * math.sin(d) * math.cos(lat1),
        math.cos(d) - math.sin(lat1) * math.sin(lat2),
    )
    return (math.degrees(lon2), math.degrees(lat2))


def initial_bearing(a: LonLat, b: LonLat) -> float:
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def bbox(coords: Sequence[LonLat]) -> tuple[float, float, float, float]:
    """(west, south, east, north)"""
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return (min(lons), min(lats), max(lons), max(lats))


def downsample(coords: Sequence[LonLat], every_m: float) -> list[LonLat]:
    """Keep roughly one vertex per `every_m` meters (always keeps endpoints)."""
    if len(coords) <= 2:
        return list(coords)
    out = [coords[0]]
    acc = 0.0
    for i in range(1, len(coords)):
        acc += haversine_m(coords[i - 1], coords[i])
        if acc >= every_m:
            out.append(coords[i])
            acc = 0.0
    if out[-1] != coords[-1]:
        out.append(coords[-1])
    return out


def shared_fraction(a: Sequence[LonLat], b: Sequence[LonLat], tolerance_m: float = 800.0) -> float:
    """
    Fraction of polyline `a` vertices lying within `tolerance_m` of some vertex of `b`.
    Used to reject near-duplicate alternative routes. O(n*m) on downsampled input.
    """
    if not a or not b:
        return 0.0
    hits = 0
    for p in a:
        if any(haversine_m(p, q) <= tolerance_m for q in b):
            hits += 1
    return hits / len(a)


def _perp_distance_m(p: LonLat, a: LonLat, b: LonLat) -> float:
    """Perpendicular distance from p to segment ab using a local flat projection."""
    lat0 = math.radians((a[1] + b[1]) / 2)
    kx = 111_320.0 * math.cos(lat0)
    ky = 110_540.0
    ax, ay = a[0] * kx, a[1] * ky
    bx, by = b[0] * kx, b[1] * ky
    px, py = p[0] * kx, p[1] * ky
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify(coords: Sequence[LonLat], tolerance_m: float) -> list[LonLat]:
    """Iterative Douglas-Peucker. Keeps the shape within `tolerance_m`."""
    n = len(coords)
    if n <= 2:
        return list(coords)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        start, end = stack.pop()
        if end - start < 2:
            continue
        best_d, best_i = -1.0, start
        a, b = coords[start], coords[end]
        for i in range(start + 1, end):
            d = _perp_distance_m(coords[i], a, b)
            if d > best_d:
                best_d, best_i = d, i
        if best_d > tolerance_m:
            keep[best_i] = True
            stack.append((start, best_i))
            stack.append((best_i, end))
    return [c for c, k in zip(coords, keep) if k]
