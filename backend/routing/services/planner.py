"""
Trip planner: orchestrates geocoding -> routing -> sampling -> weather -> risk
-> recommendation and shapes the API response.
"""
from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor

from . import geo, recommend, sampling
from .geocoding import geocode
from .routing import fetch_routes
from .weather import days_needed, fetch_hourly

log = logging.getLogger(__name__)

DISPLAY_SIMPLIFY_M = 40.0  # Douglas-Peucker tolerance for geometry sent to the client
CORRIDOR_SAMPLE_M = 15_000.0


def plan_trip(origin_q: str, destination_q: str, departure_ts: int, load_lb: float, interval_mi: int) -> dict:
    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=2) as pool:
        origin_f = pool.submit(geocode, origin_q)
        destination_f = pool.submit(geocode, destination_q)
        origin, destination = origin_f.result(), destination_f.result()
    t_geo = time.perf_counter()

    routes = fetch_routes((origin.lon, origin.lat), (destination.lon, destination.lat), want=3)
    t_route = time.perf_counter()

    # Checkpoints for every route, then ONE batched weather lookup.
    per_route = [sampling.place_checkpoints(r, interval_mi, departure_ts) for r in routes]
    flat = [cp for cps in per_route for cp in cps]
    latest_eta = max(cp.eta for cp in flat)
    series = fetch_hourly([(cp.lat, cp.lon) for cp in flat], days=days_needed(latest_eta, int(time.time())))
    t_weather = time.perf_counter()

    cursor = 0
    route_dicts = []
    all_coords: list[geo.LonLat] = []
    for route, cps in zip(routes, per_route):
        sampling.apply_weather(cps, series[cursor : cursor + len(cps)], load_lb)
        cursor += len(cps)
        all_coords.extend(route.coords)
        route_dicts.append(
            {
                "id": route.label,
                "name": f"Route {route.label}",
                "provider": route.provider,
                "profile": route.meta.get("profile"),
                "synthetic": route.synthetic,
                "via": list(route.via) if route.via else None,
                "distance_mi": round(route.distance_mi, 1),
                "duration_s": int(route.duration_s),
                "departure": departure_ts,
                "eta": int(departure_ts + route.duration_s),
                "geometry": [[round(lon, 5), round(lat, 5)] for lon, lat in geo.simplify(route.coords, DISPLAY_SIMPLIFY_M)],
                "checkpoints": [cp.as_dict() for cp in cps],
                "summary": sampling.summarize(cps, route.duration_s),
            }
        )

    recommendation = recommend.recommend(route_dicts)
    route_dicts.sort(key=lambda r: r["id"])
    t_end = time.perf_counter()
    log.info(
        "plan: geocode %.2fs, routing %.2fs, weather %.2fs, total %.2fs (%d checkpoints)",
        t_geo - t0, t_route - t_geo, t_weather - t_route, t_end - t0, len(flat),
    )

    corridor = []
    for route in routes:
        corridor.extend(geo.downsample(route.coords, CORRIDOR_SAMPLE_M))

    return {
        "request": {
            "origin": origin.as_dict(),
            "destination": destination.as_dict(),
            "departure": departure_ts,
            "load_lb": load_lb,
            "interval_mi": interval_mi,
        },
        "routes": route_dicts,
        "recommendation": recommendation,
        "bbox": list(geo.bbox(all_coords)),
        "corridor": [[round(lon, 4), round(lat, 4)] for lon, lat in corridor],
        "timing_ms": {
            "geocoding": int((t_geo - t0) * 1000),
            "routing": int((t_route - t_geo) * 1000),
            "weather": int((t_weather - t_route) * 1000),
            "total": int((t_end - t0) * 1000),
        },
        "generated_at": int(time.time()),
    }
