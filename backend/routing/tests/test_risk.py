from django.test import SimpleTestCase

from routing.services import risk


class ThresholdTableTests(SimpleTestCase):
    """Every band boundary from the assessment's table."""

    def test_wind_bands(self):
        cases = [(0, 0), (24.9, 0), (25, 1), (34.9, 1), (35, 2), (44.9, 2), (45, 3), (54.9, 3), (55, 4), (80, 4)]
        for mph, expected in cases:
            with self.subTest(mph=mph):
                self.assertEqual(risk.assess(mph, 0, 0, 1_000).level, expected)

    def test_rain_bands(self):
        cases = [(0, 0), (0.09, 0), (0.10, 1), (0.24, 1), (0.25, 2), (0.49, 2), (0.50, 3), (1.00, 3), (1.01, 4)]
        for in_hr, expected in cases:
            with self.subTest(rain=in_hr):
                self.assertEqual(risk.assess(0, in_hr, 0, 1_000).level, expected)

    def test_snow_bands(self):
        cases = [(0, 0), (0.49, 0), (0.5, 1), (0.99, 1), (1.0, 2), (1.99, 2), (2.0, 3), (3.0, 3), (3.1, 4)]
        for in_hr, expected in cases:
            with self.subTest(snow=in_hr):
                self.assertEqual(risk.assess(0, 0, in_hr, 1_000).level, expected)

    def test_overall_level_is_worst_variable(self):
        a = risk.assess(30, 0.6, 0.6, 1_000)  # wind Moderate, rain Severe, snow Moderate
        self.assertEqual(a.level, risk.SEVERE)
        self.assertEqual((a.wind_level, a.rain_level, a.snow_level), (1, 3, 1))


class LoadRuleTests(SimpleTestCase):
    def test_55_mph_is_no_travel_for_any_load(self):
        self.assertEqual(risk.assess(55, 0, 0, 0).level, risk.NO_TRAVEL)
        self.assertEqual(risk.assess(60, 0, 0, 80_000).level, risk.NO_TRAVEL)

    def test_45_54_mph_heavy_load_is_no_travel(self):
        self.assertEqual(risk.assess(50, 0, 0, 30_001).level, risk.NO_TRAVEL)
        self.assertEqual(risk.assess(45, 0, 0, 40_000).level, risk.NO_TRAVEL)
        # exactly 30,000 lb is not "> 30,000"
        self.assertEqual(risk.assess(50, 0, 0, 30_000).level, risk.SEVERE)

    def test_35_44_mph_very_heavy_load_is_severe(self):
        self.assertEqual(risk.assess(40, 0, 0, 40_001).level, risk.SEVERE)
        self.assertEqual(risk.assess(40, 0, 0, 40_000).level, risk.HIGH)
        self.assertEqual(risk.assess(44.9, 0, 0, 45_000).level, risk.SEVERE)

    def test_load_rule_never_lowers_risk(self):
        # Wind 40 mph heavy load -> Severe, but rain already No Travel.
        self.assertEqual(risk.assess(40, 1.2, 0, 45_000).level, risk.NO_TRAVEL)

    def test_drivers_explain_decision(self):
        a = risk.assess(50, 0, 0, 35_000)
        self.assertIn("No Travel", " ".join(a.drivers))
        self.assertEqual(risk.assess(5, 0, 0, 35_000).drivers, ["Conditions within safe limits"])


class ContinuousScoreTests(SimpleTestCase):
    def test_score_hits_level_at_band_lower_bound(self):
        for level, bound in enumerate(risk.WIND_BOUNDS):
            self.assertAlmostEqual(risk.continuous_score(bound, risk.WIND_BOUNDS), level + 1)
        self.assertAlmostEqual(risk.continuous_score(0, risk.WIND_BOUNDS), 0)
        self.assertAlmostEqual(risk.continuous_score(12.5, risk.WIND_BOUNDS), 0.5)

    def test_score_monotonic_and_capped(self):
        prev = -1
        for mph in range(0, 120, 5):
            s = risk.continuous_score(mph, risk.WIND_BOUNDS)
            self.assertGreaterEqual(s, prev)
            prev = s
        self.assertLessEqual(prev, 4.5)
