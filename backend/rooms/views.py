from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from users.permissions import CanReportResourceIssue, IsAdminOrReadOnly

from .filters import ResourceIssueFilter, RoomFilter
from .models import IssueStatus, ResourceIssue, ResourceType, Room, RoomStatus
from .serializers import (
    ResourceIssueSerializer,
    ResourceTypeSerializer,
    RoomAvailabilitySerializer,
    RoomSerializer,
    RoomWriteSerializer,
)


def _parse_datetime(raw: str | None, field: str):
    from django.utils.dateparse import parse_datetime

    if not raw:
        raise ValidationError({field: "Ce paramètre est obligatoire (format ISO 8601)."})
    value = parse_datetime(raw)
    if value is None:
        raise ValidationError({field: "Format de date invalide, utilisez ISO 8601."})
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.get_current_timezone())
    return value


class ResourceTypeViewSet(viewsets.ModelViewSet):
    queryset = ResourceType.objects.all()
    serializer_class = ResourceTypeSerializer
    permission_classes = [IsAdminOrReadOnly]
    search_fields = ("code", "name_fr", "name_ar")
    ordering_fields = ("name_fr", "code")
    pagination_class = None


class RoomViewSet(viewsets.ModelViewSet):
    """
    CRUD on rooms. Deletion is a soft delete: the row is flagged and hidden from
    every listing but its bookings history stays intact.
    """

    permission_classes = [IsAdminOrReadOnly]
    filterset_class = RoomFilter
    search_fields = ("name", "name_ar", "code", "location", "description")
    ordering_fields = ("name", "capacity", "status", "created_at")

    def get_queryset(self):
        return (
            Room.objects.all()
            .prefetch_related("resources__resource_type")
            .annotate(
                open_issues_count=Count(
                    "issues",
                    filter=Q(issues__status__in=[IssueStatus.OPEN, IssueStatus.IN_PROGRESS]),
                    distinct=True,
                )
            )
            .order_by("name")
        )

    def get_serializer_class(self):
        if self.action in {"create", "update", "partial_update"}:
            return RoomWriteSerializer
        return RoomSerializer

    @extend_schema(
        parameters=[
            OpenApiParameter("start", str, description="ISO 8601 start of the window"),
            OpenApiParameter("end", str, description="ISO 8601 end of the window"),
            OpenApiParameter("capacity", int, description="Minimum capacity required"),
        ],
        responses=RoomAvailabilitySerializer(many=True),
    )
    @action(detail=False, methods=["get"], url_path="available")
    def available(self, request):
        """Rooms that are free for a given window - drives the booking form."""
        from bookings.services import rooms_available_between

        start = _parse_datetime(request.query_params.get("start"), "start")
        end = _parse_datetime(request.query_params.get("end"), "end")
        if end <= start:
            raise ValidationError({"end": "La fin doit être postérieure au début."})

        capacity = request.query_params.get("capacity")
        queryset = self.get_queryset()
        if capacity:
            queryset = queryset.filter(capacity__gte=int(capacity))

        results = rooms_available_between(queryset, start, end)
        payload = [
            {
                "room": RoomSerializer(room).data,
                "is_available": is_available,
                "reason": reason,
            }
            for room, is_available, reason in results
        ]
        return Response(payload)

    @extend_schema(responses=RoomSerializer)
    @action(detail=True, methods=["post"], url_path="restore", permission_classes=[IsAdminOrReadOnly])
    def restore(self, request, pk=None):
        """Bring a soft deleted room back."""
        room = Room.all_objects.filter(pk=pk).first()
        if room is None:
            return Response({"detail": "Salle introuvable."}, status=status.HTTP_404_NOT_FOUND)
        room.restore()
        return Response(RoomSerializer(room).data)

    @extend_schema(responses=RoomSerializer(many=True))
    @action(detail=False, methods=["get"], url_path="maintenance")
    def maintenance(self, request):
        """Rooms currently unavailable (maintenance or closed)."""
        queryset = self.get_queryset().exclude(status=RoomStatus.AVAILABLE)
        page = self.paginate_queryset(queryset)
        serializer = RoomSerializer(page if page is not None else queryset, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)


class ResourceIssueViewSet(viewsets.ModelViewSet):
    """Incidents on room resources, reported by the room managers."""

    queryset = ResourceIssue.objects.select_related("room", "room_resource", "reported_by")
    serializer_class = ResourceIssueSerializer
    permission_classes = [CanReportResourceIssue]
    filterset_class = ResourceIssueFilter
    search_fields = ("description", "room__name")
    ordering_fields = ("created_at", "status")

    def perform_create(self, serializer):
        serializer.save(reported_by=self.request.user)

    @extend_schema(request=None, responses=ResourceIssueSerializer)
    @action(detail=True, methods=["post"], url_path="resolve")
    def resolve(self, request, pk=None):
        issue = self.get_object()
        issue.status = IssueStatus.RESOLVED
        issue.resolved_at = timezone.now()
        issue.save(update_fields=["status", "resolved_at"])
        return Response(ResourceIssueSerializer(issue).data)
