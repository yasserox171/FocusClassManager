from datetime import time, timedelta

from django.conf import settings
from django.core.cache import cache
from django.db.models import Count, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from bookings.models import Booking, BookingStatus
from faas.cache import analytics_version
from bookings.services import (
    business_hours_in_range,
    calculate_usage_stats,
    combine,
    month_range,
)
from rooms.models import IssueStatus, ResourceIssue, Room, RoomStatus


def _cached(key: str, producer):
    """Cache a payload under a versioned key so writes invalidate it implicitly."""
    ttl = getattr(settings, "ANALYTICS_CACHE_TTL", 300)
    versioned_key = f"{key}:v{analytics_version()}"
    value = cache.get(versioned_key)
    if value is None:
        value = producer()
        cache.set(versioned_key, value, ttl)
    return value


def _date_range(request, default_days: int = 30):
    start_raw = request.query_params.get("start_date")
    end_raw = request.query_params.get("end_date")
    end = parse_date(end_raw) if end_raw else timezone.localdate()
    start = parse_date(start_raw) if start_raw else end - timedelta(days=default_days)
    if start is None or end is None:
        raise ValidationError({"start_date": "Format attendu: AAAA-MM-JJ."})
    if end < start:
        raise ValidationError({"end_date": "La date de fin doit suivre la date de début."})
    return start, end


class DashboardSummaryView(APIView):
    """Headline numbers of the dashboard."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict})
    def get(self, request):
        def build():
            now = timezone.now()
            today = timezone.localdate()
            day_start = combine(today, time.min)
            day_end = combine(today + timedelta(days=1), time.min)
            week_end = combine(today + timedelta(days=7), time.min)

            rooms = Room.objects.all()
            total_rooms = rooms.count()
            maintenance = rooms.filter(status=RoomStatus.MAINTENANCE).count()
            closed = rooms.filter(status=RoomStatus.CLOSED).count()

            busy_now = set(
                Booking.objects.active()
                .overlapping(now, now + timedelta(minutes=1))
                .values_list("room_id", flat=True)
            )
            operational = rooms.filter(status=RoomStatus.AVAILABLE)
            available_now = operational.exclude(id__in=busy_now).count()

            bookings_today = Booking.objects.active().in_range(day_start, day_end).count()
            bookings_week = Booking.objects.active().in_range(day_start, week_end).count()
            ongoing = Booking.objects.active().overlapping(now, now + timedelta(minutes=1)).count()

            return {
                "total_rooms": total_rooms,
                "available_now": available_now,
                "occupied_now": len(busy_now),
                "maintenance_rooms": maintenance,
                "closed_rooms": closed,
                "bookings_today": bookings_today,
                "bookings_next_7_days": bookings_week,
                "ongoing_bookings": ongoing,
                "open_issues": ResourceIssue.objects.filter(
                    status__in=[IssueStatus.OPEN, IssueStatus.IN_PROGRESS]
                ).count(),
                "cancelled_today": Booking.objects.filter(
                    status=BookingStatus.CANCELLED,
                    start_datetime__gte=day_start,
                    start_datetime__lt=day_end,
                ).count(),
                "generated_at": timezone.now().isoformat(),
            }

        return Response(_cached("faas:analytics:summary", build))


class RoomUsageView(APIView):
    """Occupancy rate and booked hours for every room over a period."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter("start_date", str, description="AAAA-MM-JJ"),
            OpenApiParameter("end_date", str, description="AAAA-MM-JJ"),
        ],
        responses={200: dict},
    )
    def get(self, request):
        start, end = _date_range(request)
        cache_key = f"faas:analytics:room-usage:{start}:{end}"

        def build():
            window_start = combine(start, time.min)
            window_end = combine(end + timedelta(days=1), time.min)
            capacity_hours = business_hours_in_range(start, end)

            rows = []
            bookings = (
                Booking.objects.active()
                .in_range(window_start, window_end)
                .select_related("room")
            )
            per_room: dict[int, dict] = {}
            for booking in bookings:
                bucket = per_room.setdefault(
                    booking.room_id,
                    {"bookings_count": 0, "booked_hours": 0.0, "attendees": 0},
                )
                slice_start = max(booking.start_datetime, window_start)
                slice_end = min(booking.end_datetime, window_end)
                bucket["bookings_count"] += 1
                bucket["booked_hours"] += (slice_end - slice_start).total_seconds() / 3600
                bucket["attendees"] += booking.expected_attendees

            for room in Room.objects.all().order_by("name"):
                stats = per_room.get(room.id, {"bookings_count": 0, "booked_hours": 0.0, "attendees": 0})
                booked_hours = round(stats["booked_hours"], 2)
                rows.append(
                    {
                        "room_id": room.id,
                        "room_name": room.name,
                        "room_code": room.code,
                        "color": room.color,
                        "capacity": room.capacity,
                        "status": room.status,
                        "bookings_count": stats["bookings_count"],
                        "booked_hours": booked_hours,
                        "available_hours": round(capacity_hours, 2),
                        "occupancy_rate": (
                            round((booked_hours / capacity_hours) * 100, 2) if capacity_hours else 0.0
                        ),
                        "average_attendees": (
                            round(stats["attendees"] / stats["bookings_count"], 1)
                            if stats["bookings_count"]
                            else 0
                        ),
                    }
                )

            rows.sort(key=lambda row: row["booked_hours"], reverse=True)
            return {
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "rooms": rows,
                "most_booked": rows[0] if rows else None,
            }

        return Response(_cached(cache_key, build))


class RoomStatsView(APIView):
    """Detailed statistics of a single room (peak hours, weekday split)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict})
    def get(self, request, room_id: int):
        start, end = _date_range(request, default_days=90)
        cache_key = f"faas:analytics:room:{room_id}:{start}:{end}"
        return Response(_cached(cache_key, lambda: calculate_usage_stats(room_id, start, end)))


class TimelineView(APIView):
    """Bookings per month over the last N months."""

    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[OpenApiParameter("months", int, description="How many months back, default 12")],
        responses={200: dict},
    )
    def get(self, request):
        months = max(1, min(int(request.query_params.get("months", 12)), 36))
        cache_key = f"faas:analytics:timeline:{months}:{timezone.localdate().replace(day=1)}"

        def build():
            ranges = month_range(timezone.localdate(), months_back=months - 1)
            window_start = combine(ranges[0][0], time.min)
            window_end = combine(ranges[-1][1] + timedelta(days=1), time.min)

            counts = (
                Booking.objects.active()
                .filter(start_datetime__gte=window_start, start_datetime__lt=window_end)
                .annotate(month=TruncMonth("start_datetime"))
                .values("month")
                .annotate(total=Count("id"), attendees=Sum("expected_attendees"))
            )
            by_month = {
                timezone.localtime(row["month"]).date().replace(day=1): row for row in counts
            }

            return {
                "months": [
                    {
                        "month": start.strftime("%Y-%m"),
                        "bookings": by_month.get(start, {}).get("total", 0),
                        "attendees": by_month.get(start, {}).get("attendees") or 0,
                    }
                    for start, _end in ranges
                ]
            }

        return Response(_cached(cache_key, build))


class PeakHoursView(APIView):
    """Aggregated peak hours across every room."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict})
    def get(self, request):
        start, end = _date_range(request, default_days=30)
        cache_key = f"faas:analytics:peak:{start}:{end}"
        return Response(_cached(cache_key, lambda: calculate_usage_stats(None, start, end)))


class ResourceUsageView(APIView):
    """Which resources are requested the most."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: dict})
    def get(self, request):
        start, end = _date_range(request, default_days=90)
        cache_key = f"faas:analytics:resources:{start}:{end}"

        def build():
            window_start = combine(start, time.min)
            window_end = combine(end + timedelta(days=1), time.min)
            rows = (
                Booking.objects.active()
                .in_range(window_start, window_end)
                .values(
                    "required_resources__id",
                    "required_resources__code",
                    "required_resources__name_fr",
                    "required_resources__name_ar",
                )
                .annotate(total=Count("id"))
                .filter(required_resources__id__isnull=False)
                .order_by("-total")
            )
            return {
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "resources": [
                    {
                        "id": row["required_resources__id"],
                        "code": row["required_resources__code"],
                        "name_fr": row["required_resources__name_fr"],
                        "name_ar": row["required_resources__name_ar"],
                        "bookings": row["total"],
                    }
                    for row in rows
                ],
            }

        return Response(_cached(cache_key, build))
