from datetime import timedelta

from django.db.models import Count
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from users.permissions import PublicReadAdminWrite

from .filters import BookingFilter, BookingSeriesFilter
from .models import Booking, BookingSeries, BookingStatus, ConflictPolicy
from .serializers import (
    BookingCreateSerializer,
    BookingCreationResultSerializer,
    BookingPreviewSerializer,
    BookingSerializer,
    BookingSeriesSerializer,
    BookingUpdateSerializer,
    SeriesUpdateSerializer,
)
from .services import (
    BookingConflictError,
    RecurrenceError,
    check_collision,
    create_recurrent_bookings,
    expand_recurrence,
    find_conflicts,
)


def _parse_dt(raw, field):
    value = parse_datetime(raw) if raw else None
    if value is None:
        raise ValidationError({field: "Date ISO 8601 requise."})
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.get_current_timezone())
    return value


class BookingViewSet(viewsets.ModelViewSet):
    """
    Bookings.

    * ``POST /api/bookings/`` creates a one-off booking or a whole recurring
      series depending on ``recurrence_type``.
    * ``DELETE /api/bookings/{id}/?scope=series`` cancels the whole series.
    """

    queryset = Booking.objects.select_related("room", "booked_by", "series").prefetch_related(
        "required_resources"
    )
    permission_classes = [PublicReadAdminWrite]
    filterset_class = BookingFilter
    search_fields = ("title", "purpose", "booked_by_name", "room__name", "room__code")
    ordering_fields = ("start_datetime", "end_datetime", "created_at", "room__name")
    ordering = ("start_datetime",)

    def get_serializer_class(self):
        if self.action == "create":
            return BookingCreateSerializer
        if self.action in {"update", "partial_update"}:
            return BookingUpdateSerializer
        return BookingSerializer

    # -- create ------------------------------------------------------------
    @extend_schema(
        request=BookingCreateSerializer,
        responses={201: BookingCreationResultSerializer},
        description=(
            "Creates a one-off booking (recurrence_type=none) or a full recurring "
            "series. With conflict_policy=strict the whole request is rejected as "
            "soon as one occurrence collides; with skip, free dates are created and "
            "the conflicting ones are reported in `skipped`."
        ),
    )
    def create(self, request, *args, **kwargs):
        serializer = BookingCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        payload = {
            "title": data["title"],
            "purpose": data.get("purpose", ""),
            "notes": data.get("notes", ""),
            "expected_attendees": data.get("expected_attendees", 1),
            "booked_by": data.get("booked_by"),
            "booked_by_name": data.get("booked_by_name", ""),
        }

        try:
            result = create_recurrent_bookings(
                room=data["room"],
                payload=payload,
                recurrence=serializer.recurrence_kwargs(data),
                conflict_policy=data.get("conflict_policy", ConflictPolicy.STRICT),
                created_by=request.user,
                required_resources=list(data.get("required_resources") or []),
            )
        except BookingConflictError as exc:
            return Response(
                {
                    "detail": "Conflit de réservation: la salle est déjà occupée.",
                    "code": "booking_conflict",
                    "conflicts": [conflict.as_dict() for conflict in exc.conflicts],
                },
                status=status.HTTP_409_CONFLICT,
            )
        except RecurrenceError as exc:
            raise ValidationError({"recurrence_type": str(exc)}) from exc

        body = {
            "series": BookingSeriesSerializer(result.series).data if result.series else None,
            "created": BookingSerializer(result.created, many=True).data,
            "created_count": result.created_count,
            "skipped_count": result.skipped_count,
            "skipped": [conflict.as_dict() for conflict in result.skipped],
        }
        return Response(body, status=status.HTTP_201_CREATED)

    # -- delete ------------------------------------------------------------
    @extend_schema(
        parameters=[
            OpenApiParameter(
                "scope",
                str,
                description="occurrence (default) | series | future - what to cancel",
            ),
            OpenApiParameter(
                "purge", bool, description="Admin only: really delete instead of cancelling."
            ),
        ],
        responses={204: None},
    )
    def destroy(self, request, *args, **kwargs):
        booking = self.get_object()
        scope = request.query_params.get("scope", "occurrence")
        purge = request.query_params.get("purge", "").lower() in {"1", "true", "yes"}
        reason = request.query_params.get("reason", "")

        if purge and not request.user.is_admin:
            raise PermissionDenied("Seul un administrateur peut supprimer définitivement.")

        if scope in {"series", "future"} and booking.series_id:
            queryset = booking.series.occurrences.all()
            if scope == "future":
                queryset = queryset.filter(start_datetime__gte=booking.start_datetime)
            if purge:
                queryset.delete()
                if scope == "series":
                    booking.series.delete()
            else:
                queryset.update(status=BookingStatus.CANCELLED, cancellation_reason=reason)
                if scope == "series":
                    booking.series.status = BookingStatus.CANCELLED
                    booking.series.save(update_fields=["status"])
        else:
            if purge:
                booking.delete()
            else:
                booking.status = BookingStatus.CANCELLED
                booking.cancellation_reason = reason
                booking.save(update_fields=["status", "cancellation_reason"])

        return Response(status=status.HTTP_204_NO_CONTENT)

    # -- helper endpoints --------------------------------------------------
    @extend_schema(
        request=BookingPreviewSerializer,
        responses={200: dict},
        description="Dry run of a recurrence: returns every generated slot and its conflicts.",
    )
    @action(detail=False, methods=["post"], url_path="preview")
    def preview(self, request):
        serializer = BookingPreviewSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            windows = expand_recurrence(**serializer.recurrence_kwargs(data))
        except RecurrenceError as exc:
            raise ValidationError({"recurrence_type": str(exc)}) from exc

        exclude_series = data.get("exclude_series")
        conflicts = find_conflicts(
            data["room"].id,
            windows,
            exclude_series_id=exclude_series.id if exclude_series else None,
        )
        conflicting_starts = {conflict.start for conflict in conflicts}

        return Response(
            {
                "occurrences_count": len(windows),
                "conflicts_count": len(conflicts),
                "occurrences": [
                    {
                        "start": start.isoformat(),
                        "end": end.isoformat(),
                        "has_conflict": start in conflicting_starts,
                    }
                    for start, end in windows
                ],
                "conflicts": [conflict.as_dict() for conflict in conflicts],
            }
        )

    @extend_schema(
        parameters=[
            OpenApiParameter("room", int, required=True),
            OpenApiParameter("start", str, required=True),
            OpenApiParameter("end", str, required=True),
            OpenApiParameter("exclude_booking", int),
        ],
        responses={200: dict},
        description="Collision check for a single window.",
    )
    @action(detail=False, methods=["get"], url_path="check-collision")
    def check_collision_endpoint(self, request):
        room_id = request.query_params.get("room")
        if not room_id:
            raise ValidationError({"room": "Paramètre obligatoire."})
        start = _parse_dt(request.query_params.get("start"), "start")
        end = _parse_dt(request.query_params.get("end"), "end")
        if end <= start:
            raise ValidationError({"end": "La fin doit être postérieure au début."})
        exclude = request.query_params.get("exclude_booking")

        has_conflict = check_collision(
            int(room_id), start, end, exclude_booking_id=int(exclude) if exclude else None
        )
        conflicts = find_conflicts(
            int(room_id),
            [(start, end)],
            exclude_booking_id=int(exclude) if exclude else None,
        )
        return Response(
            {
                "has_conflict": has_conflict,
                "conflicts": conflicts[0].as_dict()["conflicts"] if conflicts else [],
            }
        )

    @extend_schema(
        parameters=[OpenApiParameter("days", int, description="Horizon in days, default 7")],
        responses=BookingSerializer(many=True),
    )
    @action(detail=False, methods=["get"], url_path="upcoming")
    def upcoming(self, request):
        """Next bookings - powers the dashboard list."""
        days = int(request.query_params.get("days", 7))
        now = timezone.now()
        queryset = (
            self.filter_queryset(self.get_queryset())
            .active()
            .filter(start_datetime__gte=now, start_datetime__lte=now + timedelta(days=days))
            .order_by("start_datetime")
        )
        page = self.paginate_queryset(queryset)
        serializer = BookingSerializer(page if page is not None else queryset, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @extend_schema(
        parameters=[
            OpenApiParameter("start", str, required=True, description="ISO 8601"),
            OpenApiParameter("end", str, required=True, description="ISO 8601"),
            OpenApiParameter("rooms", str, description="Comma separated room ids"),
        ],
        responses=BookingSerializer(many=True),
    )
    @action(detail=False, methods=["get"], url_path="calendar")
    def calendar(self, request):
        """Every booking overlapping a window - feeds the calendar view."""
        start = _parse_dt(request.query_params.get("start"), "start")
        end = _parse_dt(request.query_params.get("end"), "end")
        queryset = self.get_queryset().active().in_range(start, end)

        rooms = request.query_params.get("rooms")
        if rooms:
            room_ids = [int(value) for value in rooms.split(",") if value.strip().isdigit()]
            queryset = queryset.filter(room_id__in=room_ids)

        return Response(BookingSerializer(queryset.order_by("start_datetime"), many=True).data)

    @extend_schema(request=None, responses=BookingSerializer)
    @action(detail=True, methods=["post"], url_path="restore")
    def restore(self, request, pk=None):
        """Un-cancel a booking, provided the slot is still free."""
        booking = self.get_object()
        if check_collision(
            booking.room_id,
            booking.start_datetime,
            booking.end_datetime,
            exclude_booking_id=booking.pk,
        ):
            return Response(
                {"detail": "Le créneau a été repris par une autre réservation."},
                status=status.HTTP_409_CONFLICT,
            )
        booking.status = BookingStatus.CONFIRMED
        booking.cancellation_reason = ""
        booking.save(update_fields=["status", "cancellation_reason"])
        return Response(BookingSerializer(booking).data)


class BookingSeriesViewSet(viewsets.ModelViewSet):
    """Recurring series: read, edit the shared fields, cancel or delete."""

    queryset = (
        BookingSeries.objects.select_related("room", "booked_by")
        .prefetch_related("required_resources")
        .annotate(occurrences_count=Count("occurrences"))
    )
    permission_classes = [PublicReadAdminWrite]
    filterset_class = BookingSeriesFilter
    search_fields = ("title", "purpose", "booked_by_name", "room__name")
    ordering_fields = ("start_date", "created_at")
    http_method_names = ["get", "patch", "put", "delete", "head", "options"]

    def get_serializer_class(self):
        if self.action in {"update", "partial_update"}:
            return SeriesUpdateSerializer
        return BookingSeriesSerializer

    @extend_schema(responses=BookingSerializer(many=True))
    @action(detail=True, methods=["get"], url_path="occurrences")
    def occurrences(self, request, pk=None):
        series = self.get_object()
        queryset = series.occurrences.select_related("room").order_by("start_datetime")
        page = self.paginate_queryset(queryset)
        serializer = BookingSerializer(page if page is not None else queryset, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        """Cancels the series and all of its occurrences (``?purge=true`` deletes)."""
        series = self.get_object()
        purge = request.query_params.get("purge", "").lower() in {"1", "true", "yes"}
        if purge:
            if not request.user.is_admin:
                raise PermissionDenied("Seul un administrateur peut supprimer définitivement.")
            series.delete()
        else:
            series.occurrences.update(status=BookingStatus.CANCELLED)
            series.status = BookingStatus.CANCELLED
            series.save(update_fields=["status"])
        return Response(status=status.HTTP_204_NO_CONTENT)
