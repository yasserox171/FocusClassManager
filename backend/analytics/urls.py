from django.urls import path

from .views import (
    DashboardSummaryView,
    PeakHoursView,
    ResourceUsageView,
    RoomStatsView,
    RoomUsageView,
    TimelineView,
)

urlpatterns = [
    path("analytics/summary/", DashboardSummaryView.as_view(), name="analytics-summary"),
    path("analytics/room-usage/", RoomUsageView.as_view(), name="analytics-room-usage"),
    path("analytics/rooms/<int:room_id>/", RoomStatsView.as_view(), name="analytics-room"),
    path("analytics/timeline/", TimelineView.as_view(), name="analytics-timeline"),
    path("analytics/peak-hours/", PeakHoursView.as_view(), name="analytics-peak-hours"),
    path("analytics/resources/", ResourceUsageView.as_view(), name="analytics-resources"),
]
