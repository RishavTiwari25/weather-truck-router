"""
Checkpoint sampling: place a checkpoint every N miles along each route, estimate
the truck's arrival time there, look up the forecast for that moment, and
classify the risk. Segment mileage is then attributed to risk levels.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from . import geo, risk
from .routing import Route
from .weather import HourlySeries

ALLOWED_INTERVALS_MI = (10, 25, 50)


@dataclass
class Checkpoint:
    index: int
    lon: float
    lat: float
    mile: float
    eta: int  # unix seconds UTC
    weather: dict = field(default_factory=dict)
    risk: risk.RiskAssessment | None = None

    def as_dict(self) -> dict:
        return {
            "index": self.index,
            "lon": round(self.lon, 5),
            "lat": round(self.lat, 5),
            "mile": round(self.mile, 1),
            "eta": self.eta,
            "weather": self.weather,
            "risk": self.risk.as_dict() if self.risk else None,
        }


def checkpoint_distances_m(total_m: float, interval_mi: float) -> list[float]:
    """0, d, 2d, ... plus the destination (merged if the tail is < 40% of d)."""
    step = geo.miles_to_meters(interval_mi)
    distances = []
    d = 0.0
    while d < total_m:
        distances.append(d)
        d += step
    if total_m - distances[-1] < 0.4 * step and len(distances) > 1:
        distances[-1] = total_m
    else:
        distances.append(total_m)
    return distances


def place_checkpoints(route: Route, interval_mi: float, departure_ts: int) -> list[Checkpoint]:
    out = []
    for i, dist in enumerate(checkpoint_distances_m(route.distance_m, interval_mi)):
        (lon, lat), _, _ = geo.point_at_distance(route.coords, route.cum_dist_m, dist)
        elapsed = geo.value_at_distance(route.cum_dist_m, route.cum_time_s, dist)
        out.append(Checkpoint(i, lon, lat, geo.meters_to_miles(dist), int(round(departure_ts + elapsed))))
    return out


def apply_weather(checkpoints: list[Checkpoint], series: list[HourlySeries], load_lb: float) -> None:
    for cp, s in zip(checkpoints, series):
        cp.weather = s.at(cp.eta)
        cp.risk = risk.assess(cp.weather["wind_mph"], cp.weather["rain_in_hr"], cp.weather["snow_in_hr"], load_lb)


def summarize(checkpoints: list[Checkpoint], duration_s: float) -> dict:
    """
    Attribute the miles between consecutive checkpoints to the worse of the two
    endpoint risk levels (conservative), then aggregate.
    """
    miles_by_level = [0.0] * len(risk.LEVELS)
    weighted = 0.0
    total = 0.0
    for a, b in zip(checkpoints, checkpoints[1:]):
        miles = b.mile - a.mile
        level = max(a.risk.level, b.risk.level)
        miles_by_level[level] += miles
        weighted += level * miles
        total += miles

    worst = max(checkpoints, key=lambda c: (c.risk.level, c.risk.score))
    avg = weighted / total if total else 0.0
    return {
        "total_miles": round(total, 1),
        "duration_s": int(duration_s),
        "miles_by_level": [round(m, 1) for m in miles_by_level],
        "no_travel_miles": round(miles_by_level[risk.NO_TRAVEL], 1),
        "severe_miles": round(miles_by_level[risk.SEVERE], 1),
        "high_miles": round(miles_by_level[risk.HIGH], 1),
        "moderate_miles": round(miles_by_level[risk.MODERATE], 1),
        "low_miles": round(miles_by_level[risk.LOW], 1),
        "avg_risk": round(avg, 2),
        "max_level": worst.risk.level,
        "max_label": worst.risk.label,
        "worst_checkpoint_index": worst.index,
        "checkpoint_count": len(checkpoints),
    }
