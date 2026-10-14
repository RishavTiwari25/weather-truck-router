"""Sampling, summarising, recommending and heatmap gridding without any network."""
from django.test import SimpleTestCase

from routing.services import geo, heatmap, recommend, risk, sampling
from routing.services.routing import Route
from routing.services.weather import HourlySeries


def straight_route(miles: float, mph: float = 60.0, n: int = 50) -> Route:
    """A due-east route of `miles` at constant speed with n vertices."""
    start = (-100.0, 40.0)
    coords = []
    total_m = geo.miles_to_meters(miles)
    for i in range(n):
        coords.append(geo.destination_point(start, 90, total_m * i / (n - 1)))
    cum = geo.cumulative_distances_m(coords)
    k = total_m / cum[-1]
    cum = [c * k for c in cum]
    duration = miles / mph * 3600
    return Route("test", coords, cum, [c / total_m * duration for c in cum], total_m, duration)


def series(wind: float, rain: float = 0.0, snow: float = 0.0, hours: int = 72, t0: int = 1_700_000_000) -> HourlySeries:
    n = hours
    return HourlySeries(
        times=[t0 + h * 3600 for h in range(n)],
        wind_mph=[wind] * n,
        gust_mph=[wind * 1.3] * n,
        rain_in=[rain] * n,
        snow_in=[snow] * n,
        temp_f=[50.0] * n,
        code=[0] * n,
        visibility_m=[20000.0] * n,
    )


class CheckpointTests(SimpleTestCase):
    def test_spacing_and_destination(self):
        d = sampling.checkpoint_distances_m(geo.miles_to_meters(100), 25)
        self.assertEqual([round(geo.meters_to_miles(x)) for x in d], [0, 25, 50, 75, 100])

    def test_short_tail_is_merged_into_destination(self):
        d = sampling.checkpoint_distances_m(geo.miles_to_meters(103), 25)
        self.assertEqual([round(geo.meters_to_miles(x)) for x in d], [0, 25, 50, 75, 103])
        d = sampling.checkpoint_distances_m(geo.miles_to_meters(115), 25)
        self.assertEqual([round(geo.meters_to_miles(x)) for x in d], [0, 25, 50, 75, 100, 115])

    def test_eta_grows_with_distance(self):
        route = straight_route(300, mph=60)
        cps = sampling.place_checkpoints(route, 50, departure_ts=1_700_000_000)
        self.assertEqual(len(cps), 7)
        self.assertEqual(cps[0].eta, 1_700_000_000)
        # 300 miles at 60 mph = 5h
        self.assertAlmostEqual(cps[-1].eta, 1_700_000_000 + 5 * 3600, delta=2)
        self.assertAlmostEqual(cps[3].eta, 1_700_000_000 + 2.5 * 3600, delta=2)
        self.assertAlmostEqual(cps[3].mile, 150, places=1)
        for a, b in zip(cps, cps[1:]):
            self.assertGreater(b.lon, a.lon)  # heading east

    def test_interval_choices(self):
        self.assertEqual(sampling.ALLOWED_INTERVALS_MI, (10, 25, 50))


class SummaryTests(SimpleTestCase):
    def test_miles_attributed_to_worse_endpoint(self):
        route = straight_route(100)
        cps = sampling.place_checkpoints(route, 25, 0)
        winds = [5, 5, 50, 5, 5]  # one Severe checkpoint in the middle (light load)
        sampling.apply_weather(cps, [series(w) for w in winds], load_lb=10_000)
        summary = sampling.summarize(cps, route.duration_s)
        # Segments 25-50 and 50-75 both touch the severe checkpoint -> 50 severe miles.
        self.assertEqual(summary["severe_miles"], 50.0)
        self.assertEqual(summary["low_miles"], 50.0)
        self.assertEqual(summary["max_label"], "Severe")
        self.assertEqual(summary["worst_checkpoint_index"], 2)
        self.assertAlmostEqual(summary["avg_risk"], (3 * 50) / 100, places=2)

    def test_eta_hour_interpolation(self):
        s = series(10, t0=0)
        s.wind_mph[1] = 30  # hour 1
        self.assertAlmostEqual(s.at(1800)["wind_mph"], 20.0)  # halfway between 10 and 30
        self.assertEqual(s.at(-5000)["wind_mph"], 10.0)  # clamps
        self.assertEqual(s.at(10**9)["wind_mph"], 10.0)


class RecommendationTests(SimpleTestCase):
    @staticmethod
    def route(id_, no_travel=0, severe=0, high=0, avg=0.0, duration=10_000):
        return {
            "id": id_,
            "summary": {
                "no_travel_miles": no_travel,
                "severe_miles": severe,
                "high_miles": high,
                "avg_risk": avg,
                "duration_s": duration,
                "total_miles": 500,
            },
        }

    def test_fewest_severe_miles_beats_time(self):
        routes = [self.route("A", severe=20, duration=100), self.route("B", severe=0, duration=5000)]
        rec = recommend.recommend(routes)
        self.assertEqual(rec["route_id"], "B")
        self.assertEqual([r["rank"] for r in routes], [2, 1])
        self.assertTrue(routes[1]["recommended"])

    def test_tie_breaks_follow_order(self):
        routes = [
            self.route("A", high=10, avg=0.5, duration=100),
            self.route("B", high=5, avg=0.9, duration=200),  # fewer High miles wins despite worse avg
            self.route("C", high=5, avg=0.9, duration=150),  # same as B but faster -> wins
        ]
        rec = recommend.recommend(routes)
        self.assertEqual(rec["route_id"], "C")
        self.assertEqual([r["rank"] for r in routes], [3, 2, 1])

    def test_no_travel_outranks_severe(self):
        routes = [self.route("A", no_travel=5), self.route("B", severe=300)]
        self.assertEqual(recommend.recommend(routes)["route_id"], "B")
        self.assertEqual(recommend.recommend(routes)["advisory"], "severe")

    def test_explanations_mention_losers(self):
        routes = [self.route("A", severe=20), self.route("B")]
        rec = recommend.recommend(routes)
        self.assertEqual(rec["comparisons"][0]["route_id"], "A")
        self.assertIn("Severe", rec["comparisons"][0]["reason"])


class HeatmapGridTests(SimpleTestCase):
    def test_grid_covers_padded_bbox_with_reasonable_cell_count(self):
        grid = heatmap.build_grid((-105.0, 39.0, -87.0, 42.0))
        self.assertLess(grid["bbox"][0], -105.0)
        self.assertGreater(grid["bbox"][2], -87.0)
        self.assertLessEqual(grid["nx"] * grid["ny"], heatmap.TARGET_CELLS * 1.6)
        self.assertGreaterEqual(grid["nx"] * grid["ny"], heatmap.TARGET_CELLS * 0.6)

    def test_corridor_mask_keeps_cells_near_line(self):
        grid = heatmap.build_grid((-105.0, 39.0, -87.0, 42.0))
        corridor = [(-105.0 + 18 * t / 20, 39.0 + 3 * t / 20) for t in range(21)]
        kept = heatmap.corridor_mask(grid, corridor)
        total = grid["nx"] * grid["ny"]
        self.assertGreater(len(kept), 0)
        self.assertLess(len(kept), total)
        self.assertEqual(len(set(kept)), len(kept))


class GeoTests(SimpleTestCase):
    def test_haversine_known_distance(self):
        chicago, denver = (-87.6298, 41.8781), (-104.9903, 39.7392)
        self.assertAlmostEqual(geo.meters_to_miles(geo.haversine_m(chicago, denver)), 920, delta=5)

    def test_simplify_preserves_endpoints_and_shape(self):
        coords = [(-100 + i * 0.01, 40 + (0.002 if i % 2 else 0)) for i in range(200)]
        simp = geo.simplify(coords, tolerance_m=500)
        self.assertEqual(simp[0], coords[0])
        self.assertEqual(simp[-1], coords[-1])
        self.assertLess(len(simp), 20)
        self.assertEqual(len(geo.simplify(coords, tolerance_m=1)), 200)

    def test_shared_fraction(self):
        a = [(-100 + i * 0.1, 40.0) for i in range(10)]
        b = [(-100 + i * 0.1, 40.0005) for i in range(10)]
        c = [(-100 + i * 0.1, 41.0) for i in range(10)]
        self.assertEqual(geo.shared_fraction(a, b), 1.0)
        self.assertEqual(geo.shared_fraction(a, c), 0.0)
