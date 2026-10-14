from django.conf import settings
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import HeatmapRequestSerializer, PlanRequestSerializer
from .services import risk
from .services.geocoding import geocode
from .services.heatmap import build_heatmap
from .services.planner import plan_trip
from .services.weather import active_provider


class HealthView(APIView):
    """Liveness probe plus the active provider configuration."""

    def get(self, request: Request) -> Response:
        return Response(
            {
                "status": "ok",
                "routing_provider": "openrouteservice" if settings.ORS_API_KEY else "osrm",
                "weather_provider": active_provider(),
                "geocoders": (["openrouteservice"] if settings.ORS_API_KEY else []) + ["photon", "nominatim"],
            }
        )


class RulesView(APIView):
    """Expose the risk thresholds so the UI legend is always in sync with the engine."""

    def get(self, request: Request) -> Response:
        return Response(
            {
                "levels": risk.LEVELS,
                "wind_mph": risk.WIND_BOUNDS,
                "rain_in_hr": risk.RAIN_BOUNDS,
                "snow_in_hr": risk.SNOW_BOUNDS,
                "load_rules": [
                    {"wind_min_mph": 55, "wind_max_mph": None, "load_over_lb": 0, "result": "No Travel"},
                    {"wind_min_mph": 45, "wind_max_mph": 54, "load_over_lb": risk.NO_TRAVEL_LOAD_LB, "result": "No Travel"},
                    {"wind_min_mph": 35, "wind_max_mph": 44, "load_over_lb": risk.SEVERE_LOAD_LB, "result": "Severe"},
                ],
                "recommendation_order": ["No-Travel miles", "Severe miles", "High miles", "Average risk", "Travel time"],
            }
        )


class GeocodeView(APIView):
    def get(self, request: Request) -> Response:
        q = request.query_params.get("q", "")
        return Response(geocode(q).as_dict())


class PlanView(APIView):
    """
    POST /api/plan
    {origin, destination, departure (ISO-8601), load_lb, interval_mi}
    """

    def post(self, request: Request) -> Response:
        ser = PlanRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        result = plan_trip(
            origin_q=d["origin"],
            destination_q=d["destination"],
            departure_ts=int(d["departure"].timestamp()),
            load_lb=float(d["load_lb"]),
            interval_mi=int(d["interval_mi"]),
        )
        return Response(result, status=status.HTTP_200_OK)


class HeatmapView(APIView):
    """
    POST /api/heatmap
    {bbox: [w, s, e, n], corridor: [[lon, lat], ...]}
    """

    def post(self, request: Request) -> Response:
        ser = HeatmapRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        corridor = [(float(lon), float(lat)) for lon, lat in d["corridor"]]
        return Response(build_heatmap(tuple(d["bbox"]), corridor))
