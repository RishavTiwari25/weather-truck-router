"""Provider-neutral hourly forecast series with interpolation at a timestamp."""
from __future__ import annotations

from dataclasses import dataclass


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
