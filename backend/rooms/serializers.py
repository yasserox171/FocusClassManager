from django.utils import timezone
from rest_framework import serializers

from .models import (
    IssueStatus,
    ResourceCondition,
    ResourceIssue,
    ResourceType,
    Room,
    RoomResource,
)


class ResourceTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResourceType
        fields = ("id", "code", "name_fr", "name_ar", "icon", "is_countable")


class RoomResourceSerializer(serializers.ModelSerializer):
    resource_type_detail = ResourceTypeSerializer(source="resource_type", read_only=True)

    class Meta:
        model = RoomResource
        fields = (
            "id",
            "resource_type",
            "resource_type_detail",
            "quantity",
            "condition",
            "notes",
        )


class RoomSerializer(serializers.ModelSerializer):
    resources = RoomResourceSerializer(many=True, read_only=True)
    open_issues_count = serializers.IntegerField(read_only=True)
    is_bookable = serializers.BooleanField(read_only=True)

    class Meta:
        model = Room
        fields = (
            "id",
            "name",
            "name_ar",
            "code",
            "capacity",
            "location",
            "description",
            "status",
            "color",
            "resources",
            "open_issues_count",
            "is_bookable",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class RoomWriteSerializer(RoomSerializer):
    """Accepts the resource list inline so a room is created in a single call."""

    resources = RoomResourceSerializer(many=True, required=False)

    def _sync_resources(self, room, resources_data):
        keep_ids = []
        for item in resources_data:
            item.pop("id", None)
            obj, _created = RoomResource.objects.update_or_create(
                room=room,
                resource_type=item["resource_type"],
                defaults={
                    "quantity": item.get("quantity", 1),
                    "condition": item.get("condition", ResourceCondition.OK),
                    "notes": item.get("notes", ""),
                },
            )
            keep_ids.append(obj.id)
        room.resources.exclude(id__in=keep_ids).delete()

    def create(self, validated_data):
        resources_data = validated_data.pop("resources", [])
        room = Room.objects.create(**validated_data)
        self._sync_resources(room, resources_data)
        return room

    def update(self, instance, validated_data):
        resources_data = validated_data.pop("resources", None)
        room = super().update(instance, validated_data)
        if resources_data is not None:
            self._sync_resources(room, resources_data)
        return room


class RoomAvailabilitySerializer(serializers.Serializer):
    """Read only payload used by the `available` endpoint."""

    room = RoomSerializer(read_only=True)
    is_available = serializers.BooleanField()
    reason = serializers.CharField(allow_blank=True)


class ResourceIssueSerializer(serializers.ModelSerializer):
    room_name = serializers.CharField(source="room.name", read_only=True)
    reported_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ResourceIssue
        fields = (
            "id",
            "room",
            "room_name",
            "room_resource",
            "description",
            "status",
            "reported_by",
            "reported_by_name",
            "resolved_at",
            "created_at",
        )
        read_only_fields = ("id", "reported_by", "resolved_at", "created_at")

    def get_reported_by_name(self, obj) -> str:
        if not obj.reported_by:
            return ""
        return obj.reported_by.get_full_name() or obj.reported_by.username

    def validate(self, attrs):
        room = attrs.get("room") or getattr(self.instance, "room", None)
        room_resource = attrs.get("room_resource")
        if room_resource and room and room_resource.room_id != room.id:
            raise serializers.ValidationError(
                {"room_resource": "La ressource n'appartient pas à cette salle."}
            )
        return attrs

    def update(self, instance, validated_data):
        issue = super().update(instance, validated_data)
        if issue.status == IssueStatus.RESOLVED and issue.resolved_at is None:
            issue.resolved_at = timezone.now()
            issue.save(update_fields=["resolved_at"])
        elif issue.status != IssueStatus.RESOLVED and issue.resolved_at is not None:
            issue.resolved_at = None
            issue.save(update_fields=["resolved_at"])
        return issue
