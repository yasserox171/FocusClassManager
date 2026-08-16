from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Notification
from .serializers import AlertSerializer, NotificationSerializer
from .services import build_alerts


class NotificationViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """Stored notifications for the signed-in user (plus the broadcast ones)."""

    queryset = Notification.objects.none()  # replaced per request, declared for the schema
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ("category", "level", "is_read")
    ordering_fields = ("created_at", "level")

    def get_queryset(self):
        return Notification.objects.filter(
            Q(recipient__isnull=True) | Q(recipient=self.request.user)
        ).select_related("room")

    @extend_schema(request=None, responses={200: NotificationSerializer})
    @action(detail=True, methods=["post"], url_path="read")
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save(update_fields=["is_read"])
        return Response(NotificationSerializer(notification).data)

    @extend_schema(request=None, responses={204: None})
    @action(detail=False, methods=["post"], url_path="read-all")
    def mark_all_read(self, request):
        self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        parameters=[
            OpenApiParameter("reminder_hours", int, description="Reminder horizon, default 24")
        ],
        responses=AlertSerializer(many=True),
    )
    @action(detail=False, methods=["get"], url_path="alerts")
    def alerts(self, request):
        """Live alerts: maintenance, resource issues, reminders and conflicts."""
        hours = int(request.query_params.get("reminder_hours", 24))
        return Response(build_alerts(user=request.user, reminder_hours=hours))
