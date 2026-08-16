from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ResourceIssueViewSet, ResourceTypeViewSet, RoomViewSet

router = DefaultRouter()
router.register("rooms", RoomViewSet, basename="room")
router.register("resource-types", ResourceTypeViewSet, basename="resource-type")
router.register("resource-issues", ResourceIssueViewSet, basename="resource-issue")

urlpatterns = [path("", include(router.urls))]
