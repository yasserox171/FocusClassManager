from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    room_name = serializers.CharField(source="room.name", read_only=True, default="")

    class Meta:
        model = Notification
        fields = (
            "id",
            "category",
            "level",
            "message_fr",
            "message_ar",
            "room",
            "room_name",
            "booking",
            "is_read",
            "created_at",
        )
        read_only_fields = fields


class AlertSerializer(serializers.Serializer):
    id = serializers.CharField()
    category = serializers.CharField()
    level = serializers.CharField()
    message_fr = serializers.CharField()
    message_ar = serializers.CharField()
    room_id = serializers.IntegerField(allow_null=True)
    booking_id = serializers.IntegerField(allow_null=True)
    created_at = serializers.CharField()
