"""Uniform error envelope for the API: {"error": {"code", "message", "details"}}."""
import logging

from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

log = logging.getLogger(__name__)


class UpstreamError(APIException):
    """A third-party provider (routing / weather / geocoding) failed."""

    status_code = status.HTTP_502_BAD_GATEWAY
    default_code = "upstream_error"
    default_detail = "An upstream provider failed."

    def __init__(self, provider: str, message: str):
        self.provider = provider
        super().__init__(f"{provider}: {message}")


class GeocodingError(APIException):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    default_code = "geocoding_failed"


class RoutingError(APIException):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    default_code = "routing_failed"


def api_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        log.exception("Unhandled error in %s", context.get("view"))
        return Response(
            {"error": {"code": "server_error", "message": "Unexpected server error."}},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if isinstance(exc, ValidationError):
        payload = {"code": "validation_error", "message": "Invalid request.", "details": response.data}
    else:
        code = getattr(exc, "default_code", "error")
        detail = response.data.get("detail", response.data) if isinstance(response.data, dict) else response.data
        payload = {"code": code, "message": str(detail)}
    response.data = {"error": payload}
    return response
