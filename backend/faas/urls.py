from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)


def healthcheck(_request):
    return JsonResponse({"status": "ok", "service": "faas"})


api_patterns = [
    path("", include("users.urls")),
    path("", include("rooms.urls")),
    path("", include("employees.urls")),
    path("", include("bookings.urls")),
    path("", include("notifications.urls")),
    path("", include("analytics.urls")),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", healthcheck, name="health"),
    path("api/", include(api_patterns)),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]
