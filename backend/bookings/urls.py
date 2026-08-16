from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import BookingSeriesViewSet, BookingViewSet

router = DefaultRouter()
router.register("bookings", BookingViewSet, basename="booking")
router.register("booking-series", BookingSeriesViewSet, basename="booking-series")

urlpatterns = [path("", include(router.urls))]
