"""Weather provider normalisation and the Open-Meteo -> MET Norway fallback."""
from unittest import mock

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from routing.services import metno, weather
from routing.services.series import HourlySeries


def metno_payload(*entries):
    return {"properties": {"timeseries": list(entries)}}


def entry(time, wind_mps, precip_mm=0.0, symbol="cloudy", block="next_1_hours", temp_c=10.0):
    return {
        "time": time,
        "data": {
            "instant": {"details": {"wind_speed": wind_mps, "air_temperature": temp_c}},
            block: {"summary": {"symbol_code": symbol}, "details": {"precipitation_amount": precip_mm}},
        },
    }


class MetNoParseTests(SimpleTestCase):
    def test_units_and_hourly_grid(self):
        s = metno.parse(
            metno_payload(
                entry("2026-10-14T18:00:00Z", 10.0, 2.54, "rain"),
                entry("2026-10-14T19:00:00Z", 20.0, 0.0, "clearsky_day"),
            )
        )
        self.assertEqual(s.times, [1792000800, 1792004400])
        self.assertAlmostEqual(s.wind_mph[0], 22.37, places=1)  # 10 m/s
        self.assertAlmostEqual(s.gust_mph[0], 22.37 * metno.GUST_FACTOR, places=1)
        self.assertAlmostEqual(s.rain_in[0], 0.1, places=3)  # 2.54 mm
        self.assertEqual(s.snow_in[0], 0.0)
        self.assertEqual(s.code, [63, 0])
        self.assertAlmostEqual(s.temp_f[0], 50.0)

    def test_snow_symbol_moves_precipitation_to_snow(self):
        s = metno.parse(metno_payload(entry("2026-10-14T18:00:00Z", 1.0, 2.54, "snow"), entry("2026-10-14T19:00:00Z", 1.0)))
        self.assertEqual(s.rain_in[0], 0.0)
        self.assertAlmostEqual(s.snow_in[0], 1.0, places=3)  # 0.1 in liquid x 10
        self.assertEqual(s.code[0], 73)

    def test_six_hour_blocks_are_spread_and_carried_forward(self):
        s = metno.parse(
            metno_payload(
                entry("2026-10-14T18:00:00Z", 5.0, 6.0, "rain", block="next_6_hours"),
                entry("2026-10-15T00:00:00Z", 5.0, 0.0, "cloudy", block="next_6_hours"),
            )
        )
        self.assertEqual(len(s.times), 7)
        self.assertAlmostEqual(s.rain_in[0], 1.0 / 25.4, places=4)  # 6 mm over 6 h
        self.assertAlmostEqual(s.rain_in[5], 1.0 / 25.4, places=4)  # still in the first block
        self.assertEqual(s.rain_in[6], 0.0)


class FallbackTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    @staticmethod
    def fake_series(points):
        return [HourlySeries([0, 3600], [1, 1], [1, 1], [0, 0], [0, 0], [50, 50], [0, 0], [1e4, 1e4]) for _ in points]

    @override_settings(WEATHER_PROVIDER="auto", WEATHER_FALLBACK_SECONDS=60)
    def test_quota_error_switches_to_metno_and_sticks(self):
        with mock.patch.object(weather, "_fetch_open_meteo", side_effect=weather.QuotaExceeded("Open-Meteo", "HTTP 429: Daily API request limit exceeded")) as om, \
             mock.patch.object(weather.metno, "fetch_points", side_effect=self.fake_series) as mn:
            self.assertEqual(weather.active_provider(), "open-meteo")
            out = weather.fetch_hourly([(28.6, 77.2), (19.1, 72.9)], days=3)
            self.assertEqual(len(out), 2)
            self.assertEqual(om.call_count, 1)
            self.assertEqual(mn.call_count, 1)
            self.assertEqual(weather.active_provider(), "metno")

            # Next call goes straight to MET Norway; cached points are not refetched.
            weather.fetch_hourly([(28.6, 77.2), (12.9, 77.6)], days=3)
            self.assertEqual(om.call_count, 1)
            self.assertEqual(mn.call_args_list[-1].args[0], [(12.9, 77.6)])

    @override_settings(WEATHER_PROVIDER="open-meteo")
    def test_pinned_provider_does_not_fall_back(self):
        with mock.patch.object(weather, "_fetch_open_meteo", side_effect=weather.QuotaExceeded("Open-Meteo", "HTTP 429: limit exceeded")), \
             mock.patch.object(weather.metno, "fetch_points") as mn:
            with self.assertRaises(weather.QuotaExceeded):
                weather.fetch_hourly([(28.6, 77.2)], days=3)
            mn.assert_not_called()

    @override_settings(WEATHER_PROVIDER="auto")
    def test_other_upstream_errors_propagate(self):
        with mock.patch.object(weather, "_fetch_open_meteo", side_effect=weather.UpstreamError("Open-Meteo", "HTTP 500: boom")):
            with self.assertRaises(weather.UpstreamError):
                weather.fetch_hourly([(28.6, 77.2)], days=3)
        self.assertEqual(weather.active_provider(), "open-meteo")
