"""Shared HTTP session with retries, timeouts and a polite User-Agent."""
from functools import lru_cache

import requests
from django.conf import settings
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


@lru_cache(maxsize=1)
def session() -> requests.Session:
    retry = Retry(
        total=1,
        backoff_factor=0.5,
        status_forcelist=(500, 502, 503, 504),
        allowed_methods=frozenset({"GET", "POST"}),
        raise_on_status=False,
    )
    s = requests.Session()
    adapter = HTTPAdapter(max_retries=retry, pool_connections=16, pool_maxsize=32)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    s.headers.update({"User-Agent": settings.HTTP_USER_AGENT, "Accept": "application/json"})
    return s


def timeout() -> float:
    return settings.UPSTREAM_TIMEOUT_SECONDS
