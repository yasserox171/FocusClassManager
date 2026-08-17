from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from users.permissions import PublicReadAdminWrite

from .models import Notification
from .serializers import AlertSerializer, NotificationSerializer
from .services import build_alerts


class NotificationViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """
    Broadcast notifications are public; the ones addressed to a specific person
    are only visible to them. Marking as read is an administrator action.
    """

    queryset = Notification.objects.none()  # replaced per request, declared for the schema
    serializer_class = NotificationSerializer
    permission_classes = [PublicReadAdminWrite]
    filterset_fields = ("category", "level", "is_read")
    ordering_fields = ("created_at", "level")

    def get_queryset(self):
        user = self.request.user
        scope = Q(recipient__isnull=True)
        if user and user.is_authenticated:
            scope |= Q(recipient=user)
        return Notification.objects.filter(scope).select_related("room")

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
        # Anonymous visitors get the full, unfiltered list: build_alerts only
        # narrows the scope for a signed-in non-admin (their own rooms).
        user = request.user if request.user.is_authenticated else None
        return Response(build_alerts(user=user, reminder_hours=hours))
