from django.conf import settings
from django.urls import include, path, re_path
from django.views.generic import TemplateView

urlpatterns = [
    path("api/", include("routing.urls")),
]

if settings.FRONTEND_DIST.exists():
    # Single-page app fallback: any non-API path renders the built React app.
    urlpatterns.append(
        re_path(r"^(?!api/|static/).*$", TemplateView.as_view(template_name="index.html"))
    )
