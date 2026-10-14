"""
Weather risk engine. Implements the assessment's threshold table and load rules.

Levels are ordered integers so they can be compared, averaged and summed:
    0 Low | 1 Moderate | 2 High | 3 Severe | 4 No Travel
"""
from __future__ import annotations

from dataclasses import dataclass, field

LEVELS = ["Low", "Moderate", "High", "Severe", "No Travel"]
LOW, MODERATE, HIGH, SEVERE, NO_TRAVEL = range(5)

# Upper bounds for Low / Moderate / High / Severe. Values beyond the last
# bound are "No Travel". Units: mph, in/hr, in/hr.
WIND_BOUNDS = (25.0, 35.0, 45.0, 55.0)
RAIN_BOUNDS = (0.10, 0.25, 0.50, 1.00)
SNOW_BOUNDS = (0.5, 1.0, 2.0, 3.0)

# Load rules (lb)
NO_TRAVEL_LOAD_LB = 30_000  # 45-54 mph + >30,000 lb -> No Travel
SEVERE_LOAD_LB = 40_000  # 35-44 mph + >40,000 lb -> Severe


def classify(value: float, bounds: tuple[float, float, float, float], top_exclusive: bool) -> int:
    """
    Map a measurement to a level using the threshold table.

    A reading exactly on an internal boundary (e.g. 25 mph, 0.25 in/hr) is
    placed in the HIGHER band: the table lists "Low <25", so 25 is Moderate,
    and we resolve the overlapping "0.10-0.25 / 0.25-0.50" notation
    conservatively.

    `top_exclusive` handles the last boundary: wind reads ">=55 mph -> No
    Travel" (55 is No Travel) while rain/snow read ">1.00" / ">3.0" (exactly
    1.00 in/hr is still Severe).
    """
    *internal, top = bounds
    for level, bound in enumerate(internal):
        if value < bound:
            return level
    if value < top or (top_exclusive and value == top):
        return SEVERE
    return NO_TRAVEL


def continuous_score(value: float, bounds: tuple[float, float, float, float]) -> float:
    """
    Piecewise-linear 0..4.5 score used for smooth heatmaps and ribbons.
    Equals `level` exactly at the lower bound of each band, 4 at the
    No-Travel bound, and keeps rising gently beyond it (capped at 4.5).
    """
    if value <= 0:
        return 0.0
    prev = 0.0
    for level, bound in enumerate(bounds):
        if value < bound:
            return level + (value - prev) / (bound - prev)
        prev = bound
    overshoot = (value - bounds[-1]) / bounds[-1]
    return min(4.5, 4.0 + overshoot)


@dataclass
class RiskAssessment:
    level: int
    wind_level: int
    rain_level: int
    snow_level: int
    score: float  # continuous 0..4.5 (max of the three variables)
    drivers: list[str] = field(default_factory=list)  # human-readable reasons

    @property
    def label(self) -> str:
        return LEVELS[self.level]

    def as_dict(self) -> dict:
        return {
            "level": self.level,
            "label": self.label,
            "score": round(self.score, 2),
            "wind_level": self.wind_level,
            "rain_level": self.rain_level,
            "snow_level": self.snow_level,
            "drivers": self.drivers,
        }


def assess(wind_mph: float, rain_in_hr: float, snow_in_hr: float, load_lb: float) -> RiskAssessment:
    """Combine the three weather variables and apply the load rules."""
    wind_level = classify(wind_mph, WIND_BOUNDS, top_exclusive=False)
    rain_level = classify(rain_in_hr, RAIN_BOUNDS, top_exclusive=True)
    snow_level = classify(snow_in_hr, SNOW_BOUNDS, top_exclusive=True)

    level = max(wind_level, rain_level, snow_level)
    drivers: list[str] = []
    if wind_level >= MODERATE:
        drivers.append(f"Wind {wind_mph:.0f} mph ({LEVELS[wind_level]})")
    if rain_level >= MODERATE:
        drivers.append(f"Rain {rain_in_hr:.2f} in/hr ({LEVELS[rain_level]})")
    if snow_level >= MODERATE:
        drivers.append(f"Snow {snow_in_hr:.1f} in/hr ({LEVELS[snow_level]})")

    # Load rules: wind interacting with gross load.
    if wind_mph >= WIND_BOUNDS[3]:
        level = NO_TRAVEL
        drivers.append("Wind 55+ mph: No Travel for any load")
    elif WIND_BOUNDS[2] <= wind_mph < WIND_BOUNDS[3] and load_lb > NO_TRAVEL_LOAD_LB:
        level = NO_TRAVEL
        drivers.append(f"Wind 45-54 mph with load over {NO_TRAVEL_LOAD_LB:,} lb: No Travel")
    elif WIND_BOUNDS[1] <= wind_mph < WIND_BOUNDS[2] and load_lb > SEVERE_LOAD_LB:
        level = max(level, SEVERE)
        drivers.append(f"Wind 35-44 mph with load over {SEVERE_LOAD_LB:,} lb: Severe")

    if not drivers:
        drivers.append("Conditions within safe limits")

    score = max(
        continuous_score(wind_mph, WIND_BOUNDS),
        continuous_score(rain_in_hr, RAIN_BOUNDS),
        continuous_score(snow_in_hr, SNOW_BOUNDS),
        float(level),  # load escalation lifts the score too
    )
    return RiskAssessment(level, wind_level, rain_level, snow_level, score, drivers)
