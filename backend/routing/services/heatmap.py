"""
Corridor weather heatmap.

Builds a lat/lon grid over the padded bounding box of all routes, keeps only
cells near the corridor, fetches a 0-48h hourly forecast for each cell centre
and returns compact per-hour arrays the client renders with a canvas.
"""
from __future__ import annotations

import math
import time

from . import geo, risk
from .weather import fetch_hourly

TARGET_CELLS = 300  # grid cells before corridor masking (~50-65% survive)
MIN_CELL_DEG = 0.06
MAX_CELL_DEG = 0.75
HOURS = 48


def build_grid(bbox: tuple[float, float, float, float]) -> dict:
    west, south, east, north = bbox
    width = max(east - west, 0.2)
    height = max(north - south, 0.2)
    pad_x = max(width * 0.15, 0.35)
    pad_y = max(height * 0.15, 0.35)
    west, east = west - pad_x, east + pad_x
    south, north = south - pad_y, north + pad_y

    # Correct for longitude foreshortening so cells look square on the map.
    mean_lat = math.radians((south + north) / 2)
    width_eff = (east - west) * math.cos(mean_lat)
    cell_lat = math.sqrt((width_eff * (north - south)) / TARGET_CELLS)
    cell_lat = min(MAX_CELL_DEG, max(MIN_CELL_DEG, cell_lat))
    cell_lon = cell_lat / max(0.2, math.cos(mean_lat))

    nx = max(2, math.ceil((east - west) / cell_lon))
    ny = max(2, math.ceil((north - south) / cell_lat))
    return {
        "bbox": [round(west, 4), round(south, 4), round(west + nx * cell_lon, 4), round(south + ny * cell_lat, 4)],
        "nx": nx,
        "ny": ny,
        "cell_lon": cell_lon,
        "cell_lat": cell_lat,
    }


def corridor_mask(grid: dict, corridor: list[geo.LonLat]) -> list[int]:
    """Flat indices (row-major, j*nx+i) of cells whose centre lies near the corridor."""
    west, south, _, _ = grid["bbox"]
    nx, ny = grid["nx"], grid["ny"]
    cell_lat, cell_lon = grid["cell_lat"], grid["cell_lon"]
    radius_m = max(2.2 * cell_lat * 111_000, 80_000)
    radius_deg = radius_m / 111_000

    pts = geo.downsample(corridor, radius_m * 0.5) if len(corridor) > 2 else list(corridor)
    kept = []
    for j in range(ny):
        lat = south + (j + 0.5) * cell_lat
        for i in range(nx):
            lon = west + (i + 0.5) * cell_lon
            # Cheap rectangular pre-filter before the haversine.
            near = (
                p for p in pts
                if abs(p[1] - lat) <= radius_deg and abs(p[0] - lon) <= radius_deg / max(0.2, math.cos(math.radians(lat)))
            )
            if any(geo.haversine_m((lon, lat), p) <= radius_m for p in near):
                kept.append(j * nx + i)
    return kept


def build_heatmap(bbox: tuple[float, float, float, float], corridor: list[geo.LonLat], now_ts: int | None = None) -> dict:
    now_ts = now_ts or int(time.time())
    start = now_ts - (now_ts % 3600)  # floor to hour
    hours = [start + h * 3600 for h in range(HOURS + 1)]

    grid = build_grid(bbox)
    cells = corridor_mask(grid, corridor)
    west, south = grid["bbox"][0], grid["bbox"][1]
    centres = []
    for flat in cells:
        j, i = divmod(flat, grid["nx"])
        centres.append((south + (j + 0.5) * grid["cell_lat"], west + (i + 0.5) * grid["cell_lon"]))

    # Series start at 00:00 UTC today, so 3 days always covers now + 48h.
    series = fetch_hourly(centres, days=3)

    wind: list[list[float]] = []
    rain: list[list[float]] = []
    snow: list[list[float]] = []
    score: list[list[float]] = []
    for s in series:
        offset = (start - s.times[0]) // 3600
        n = len(s.times)
        w_row, r_row, s_row, sc_row = [], [], [], []
        for h in range(HOURS + 1):
            k = min(max(offset + h, 0), n - 1)
            w, r, sn = s.wind_mph[k], s.rain_in[k], s.snow_in[k]
            w_row.append(round(w, 1))
            r_row.append(round(r, 3))
            s_row.append(round(sn, 2))
            sc_row.append(
                round(
                    max(
                        risk.continuous_score(w, risk.WIND_BOUNDS),
                        risk.continuous_score(r, risk.RAIN_BOUNDS),
                        risk.continuous_score(sn, risk.SNOW_BOUNDS),
                    ),
                    2,
                )
            )
        wind.append(w_row)
        rain.append(r_row)
        snow.append(s_row)
        score.append(sc_row)

    return {
        "bbox": grid["bbox"],
        "nx": grid["nx"],
        "ny": grid["ny"],
        "cell_lon": round(grid["cell_lon"], 5),
        "cell_lat": round(grid["cell_lat"], 5),
        "hours": hours,
        "cells": cells,
        "wind": wind,
        "rain": rain,
        "snow": snow,
        "score": score,
        "generated_at": now_ts,
    }
