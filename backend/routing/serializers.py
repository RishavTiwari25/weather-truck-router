from datetime import datetime, timedelta, timezone

from rest_framework import serializers

from .services.sampling import ALLOWED_INTERVALS_MI

MAX_PAST = timedelta(hours=24)
MAX_FUTURE = timedelta(days=14)


class PlanRequestSerializer(serializers.Serializer):
    origin = serializers.CharField(max_length=200)
    destination = serializers.CharField(max_length=200)
    departure = serializers.DateTimeField(help_text="ISO-8601 with offset, e.g. 2026-10-15T08:00:00-05:00")
    load_lb = serializers.FloatField(min_value=0, max_value=200_000)
    interval_mi = serializers.ChoiceField(choices=ALLOWED_INTERVALS_MI, default=25)

    def validate_departure(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if value < now - MAX_PAST:
            raise serializers.ValidationError("Departure is more than 24 hours in the past.")
        if value > now + MAX_FUTURE:
            raise serializers.ValidationError("Departure must be within the next 14 days (forecast horizon).")
        return value

    def validate(self, attrs):
        if attrs["origin"].strip().lower() == attrs["destination"].strip().lower():
            raise serializers.ValidationError({"destination": "Origin and destination must differ."})
        return attrs


class HeatmapRequestSerializer(serializers.Serializer):
    bbox = serializers.ListField(child=serializers.FloatField(), min_length=4, max_length=4)
    corridor = serializers.ListField(
        child=serializers.ListField(child=serializers.FloatField(), min_length=2, max_length=2),
        min_length=1,
        max_length=4000,
    )

    def validate_bbox(self, value):
        west, south, east, north = value
        if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
            raise serializers.ValidationError("bbox must be [west, south, east, north].")
        if (east - west) * (north - south) > 60 * 40:
            raise serializers.ValidationError("bbox too large for a heatmap.")
        return value
