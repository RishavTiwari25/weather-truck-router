"""
Django settings for the Weather-Aware Truck Routing API.

Configuration is environment-driven (see backend/.env.example) so the same
code runs locally, in Docker, and on a PaaS without edits.
"""
from pathlib import Path
import os

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-only-insecure-key-change-me")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "*")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", "")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "routing",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.gzip.GZipMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"

# The production build of the React app (frontend/dist) is served by Django +
# WhiteNoise when it exists, so a single service can host the whole product.
FRONTEND_DIST = Path(os.getenv("FRONTEND_DIST", BASE_DIR.parent / "frontend" / "dist"))

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [FRONTEND_DIST] if FRONTEND_DIST.exists() else [],
        "APP_DIRS": False,
        "OPTIONS": {"context_processors": []},
    }
]

WSGI_APPLICATION = "config.wsgi.application"

# No persistent data is stored; SQLite is only here to satisfy Django.
DATABASES = {
    "default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [FRONTEND_DIST] if FRONTEND_DIST.exists() else []
STORAGES = {
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}
WHITENOISE_ROOT = FRONTEND_DIST if FRONTEND_DIST.exists() else None
WHITENOISE_INDEX_FILE = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- API behaviour -----------------------------------------------------------
CORS_ALLOW_ALL_ORIGINS = env_bool("CORS_ALLOW_ALL_ORIGINS", True)
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "")

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "EXCEPTION_HANDLER": "routing.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.AnonRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"anon": os.getenv("API_THROTTLE_RATE", "60/min")},
}

# Short-lived in-memory cache for upstream weather / geocoding responses.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "truck-router",
        "OPTIONS": {"MAX_ENTRIES": 20000},
    }
}

# --- Third-party providers ---------------------------------------------------
# Routing: OpenRouteService (truck profile, 3 alternatives) when a key is set,
# otherwise the public OSRM demo server. Weather: Open-Meteo, MET Norway as fallback.
ORS_API_KEY = os.getenv("ORS_API_KEY", "").strip()
ORS_BASE_URL = os.getenv("ORS_BASE_URL", "https://api.openrouteservice.org")
OSRM_BASE_URL = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org")
OPEN_METEO_URL = os.getenv("OPEN_METEO_URL", "https://api.open-meteo.com/v1/forecast")
# "auto": Open-Meteo first, MET Norway while Open-Meteo reports its quota is
# exhausted (free quota is per outbound IP, shared on PaaS hosts). Or pin one.
WEATHER_PROVIDER = os.getenv("WEATHER_PROVIDER", "auto").strip().lower()
WEATHER_FALLBACK_SECONDS = int(os.getenv("WEATHER_FALLBACK_SECONDS", "1800"))
METNO_URL = os.getenv("METNO_URL", "https://api.met.no/weatherapi/locationforecast/2.0/compact")
NOMINATIM_URL = os.getenv("NOMINATIM_URL", "https://nominatim.openstreetmap.org")
PHOTON_URL = os.getenv("PHOTON_URL", "https://photon.komoot.io")
HTTP_USER_AGENT = os.getenv("HTTP_USER_AGENT", "ClearHaul/1.0 (github.com/RishavTiwari25/weather-truck-router)")
UPSTREAM_TIMEOUT_SECONDS = float(os.getenv("UPSTREAM_TIMEOUT_SECONDS", "25"))
WEATHER_CACHE_SECONDS = int(os.getenv("WEATHER_CACHE_SECONDS", "900"))
GEOCODE_CACHE_SECONDS = int(os.getenv("GEOCODE_CACHE_SECONDS", "86400"))

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "%(levelname)s %(name)s: %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "root": {"handlers": ["console"], "level": os.getenv("LOG_LEVEL", "INFO")},
}
