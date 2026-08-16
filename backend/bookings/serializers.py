from datetime import date

from django.utils import timezone
from rest_framework import serializers

from employees.models import Employee
from rooms.models import ResourceCondition, ResourceType, Room, RoomStatus
from rooms.serializers import ResourceTypeSerializer

from .models import (
    Booking,
    BookingSeries,
    BookingStatus,
    ConflictPolicy,
    MonthlyMode,
    RecurrenceType,
    WEEKDAY_NAME_TO_INDEX,
)
from .services import RecurrenceError, expand_recurrence


class WeekdayListField(serializers.ListField):
    """Accepts ``[0, 3]`` as well as ``["monday", "thursday"]``."""

    child = serializers.CharField()

    def to_internal_value(self, data):
        values = super().to_internal_value(data)
        result = []
        for raw in values:
            key = str(raw).strip().lower()
            if key in WEEKDAY_NAME_TO_INDEX:
                result.append(WEEKDAY_NAME_TO_INDEX[key])
                continue
            try:
                index = int(key)
            except (TypeError, ValueError):
                raise serializers.ValidationError(f"Jour de semaine invalide: {raw}")
            if not 0 <= index <= 6:
                raise serializers.ValidationError("Les jours doivent être compris entre 0 et 6.")
            result.append(index)
        return sorted(set(result))

    def to_representation(self, value):
        return list(value or [])


class BookingRoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = ("id", "name", "code", "color", "capacity", "location", "status")


class BookingSerializer(serializers.ModelSerializer):
    room_detail = BookingRoomSerializer(source="room", read_only=True)
    required_resources_detail = ResourceTypeSerializer(
        source="required_resources", many=True, read_only=True
    )
    booked_by_display = serializers.SerializerMethodField()
    is_recurring = serializers.BooleanField(read_only=True)
    duration_hours = serializers.FloatField(read_only=True)
    recurrence_type = serializers.CharField(source="series.recurrence_type", read_only=True, default=RecurrenceType.NONE)

    class Meta:
        model = Booking
        fields = (
            "id",
            "series",
            "room",
            "room_detail",
            "title",
            "purpose",
            "notes",
            "expected_attendees",
            "start_datetime",
            "end_datetime",
            "duration_hours",
            "booked_by",
            "booked_by_name",
            "booked_by_display",
            "created_by",
            "required_resources",
            "required_resources_detail",
            "status",
            "cancellation_reason",
            "is_recurring",
            "recurrence_type",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "series", "created_by", "created_at", "updated_at")

    def get_booked_by_display(self, obj) -> str:
        if obj.booked_by_id and obj.booked_by:
            return obj.booked_by.full_name
        return obj.booked_by_name


class BookingSeriesSerializer(serializers.ModelSerializer):
    room_detail = BookingRoomSerializer(source="room", read_only=True)
    occurrences_count = serializers.IntegerField(read_only=True)
    weekday_names = serializers.ListField(child=serializers.CharField(), read_only=True)
    required_resources_detail = ResourceTypeSerializer(
        source="required_resources", many=True, read_only=True
    )

    class Meta:
        model = BookingSeries
        fields = (
            "id",
            "room",
            "room_detail",
            "title",
            "purpose",
            "notes",
            "expected_attendees",
            "booked_by",
            "booked_by_name",
            "recurrence_type",
            "interval",
            "weekdays",
            "weekday_names",
            "monthly_mode",
            "month_day",
            "nth_week",
            "start_date",
            "end_date",
            "start_time",
            "end_time",
            "required_resources",
            "required_resources_detail",
            "status",
            "occurrences_count",
            "created_at",
        )
        read_only_fields = ("id", "room", "recurrence_type", "created_at")


class RecurrenceMixin(serializers.Serializer):
    """Recurrence fields plus the validation shared by create and preview."""

    recurrence_type = serializers.ChoiceField(
        choices=RecurrenceType.choices, default=RecurrenceType.NONE
    )
    interval = serializers.IntegerField(min_value=1, default=1)
    weekdays = WeekdayListField(required=False, default=list)
    monthly_mode = serializers.ChoiceField(
        choices=MonthlyMode.choices, default=MonthlyMode.DAY_OF_MONTH
    )
    month_day = serializers.IntegerField(min_value=1, max_value=31, required=False, allow_null=True)
    nth_week = serializers.IntegerField(min_value=-1, max_value=5, required=False, allow_null=True)

    start_date = serializers.DateField()
    end_date = serializers.DateField(required=False, allow_null=True)
    start_time = serializers.TimeField()
    end_time = serializers.TimeField()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        recurrence_type = attrs.get("recurrence_type", RecurrenceType.NONE)
        start_date: date = attrs["start_date"]
        end_date = attrs.get("end_date") or start_date

        if recurrence_type == RecurrenceType.NONE:
            end_date = start_date
        elif end_date < start_date:
            raise serializers.ValidationError(
                {"end_date": "La date de fin doit être postérieure à la date de début."}
            )
        attrs["end_date"] = end_date

        if attrs["start_time"] == attrs["end_time"]:
            raise serializers.ValidationError(
                {"end_time": "L'heure de fin doit être différente de l'heure de début."}
            )

        if recurrence_type == RecurrenceType.WEEKLY and not attrs.get("weekdays"):
            attrs["weekdays"] = [start_date.weekday()]

        if (
            recurrence_type == RecurrenceType.MONTHLY
            and attrs.get("monthly_mode") == MonthlyMode.NTH_WEEKDAY
            and not attrs.get("nth_week")
        ):
            raise serializers.ValidationError(
                {"nth_week": "Précisez le rang de la semaine (1 à 5, ou -1 pour la dernière)."}
            )
        return attrs

    def recurrence_kwargs(self, attrs) -> dict:
        return {
            "recurrence_type": attrs.get("recurrence_type", RecurrenceType.NONE),
            "start_date": attrs["start_date"],
            "end_date": attrs["end_date"],
            "start_time": attrs["start_time"],
            "end_time": attrs["end_time"],
            "interval": attrs.get("interval", 1),
            "weekdays": attrs.get("weekdays") or [],
            "monthly_mode": attrs.get("monthly_mode", MonthlyMode.DAY_OF_MONTH),
            "month_day": attrs.get("month_day"),
            "nth_week": attrs.get("nth_week"),
        }


class BookingCreateSerializer(RecurrenceMixin):
    """
    Single entry point for both booking kinds: leave ``recurrence_type`` at
    ``none`` for a one-off, set it to daily/weekly/monthly/yearly for a series.
    """

    room = serializers.PrimaryKeyRelatedField(queryset=Room.objects.all())
    title = serializers.CharField(max_length=200)
    purpose = serializers.CharField(required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    expected_attendees = serializers.IntegerField(min_value=1, default=1)
    booked_by = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(), required=False, allow_null=True
    )
    booked_by_name = serializers.CharField(
        max_length=150, required=False, allow_blank=True, default=""
    )
    required_resources = serializers.PrimaryKeyRelatedField(
        queryset=ResourceType.objects.all(), many=True, required=False, default=list
    )
    conflict_policy = serializers.ChoiceField(
        choices=ConflictPolicy.choices, default=ConflictPolicy.STRICT
    )

    def validate(self, attrs):
        attrs = super().validate(attrs)
        room: Room = attrs["room"]

        if room.status != RoomStatus.AVAILABLE:
            raise serializers.ValidationError(
                {"room": f"La salle « {room.name} » n'est pas disponible ({room.get_status_display()})."}
            )

        if attrs["expected_attendees"] > room.capacity:
            raise serializers.ValidationError(
                {
                    "expected_attendees": (
                        f"La salle « {room.name} » accueille au maximum {room.capacity} personnes."
                    )
                }
            )

        missing = self._missing_resources(room, attrs.get("required_resources") or [])
        if missing:
            raise serializers.ValidationError(
                {"required_resources": f"Ressources indisponibles dans cette salle: {missing}."}
            )

        if not attrs.get("booked_by_name"):
            employee = attrs.get("booked_by")
            if employee:
                attrs["booked_by_name"] = employee.full_name
            else:
                user = self.context["request"].user
                attrs["booked_by_name"] = user.get_full_name() or user.username

        # Fail fast on an impossible rule before touching the database.
        try:
            expand_recurrence(**self.recurrence_kwargs(attrs))
        except RecurrenceError as exc:
            raise serializers.ValidationError({"recurrence_type": str(exc)}) from exc

        return attrs

    @staticmethod
    def _missing_resources(room: Room, resources) -> str:
        available = {
            item.resource_type_id
            for item in room.resources.all()
            if item.quantity > 0 and item.condition == ResourceCondition.OK
        }
        missing = [resource.name_fr for resource in resources if resource.id not in available]
        return ", ".join(missing)


class BookingPreviewSerializer(RecurrenceMixin):
    """Dry run: returns the generated windows and their conflicts, creates nothing."""

    room = serializers.PrimaryKeyRelatedField(queryset=Room.objects.all())
    exclude_series = serializers.PrimaryKeyRelatedField(
        queryset=BookingSeries.objects.all(), required=False, allow_null=True
    )


class BookingUpdateSerializer(serializers.ModelSerializer):
    """Edits a single occurrence, re-checking collisions for the new window."""

    class Meta:
        model = Booking
        fields = (
            "room",
            "title",
            "purpose",
            "notes",
            "expected_attendees",
            "start_datetime",
            "end_datetime",
            "booked_by",
            "booked_by_name",
            "required_resources",
            "status",
            "cancellation_reason",
        )

    def validate(self, attrs):
        from .services import collision_queryset

        instance = self.instance
        room = attrs.get("room", instance.room)
        start = attrs.get("start_datetime", instance.start_datetime)
        end = attrs.get("end_datetime", instance.end_datetime)
        status_value = attrs.get("status", instance.status)

        if end <= start:
            raise serializers.ValidationError(
                {"end_datetime": "La fin doit être postérieure au début."}
            )

        attendees = attrs.get("expected_attendees", instance.expected_attendees)
        if attendees > room.capacity:
            raise serializers.ValidationError(
                {"expected_attendees": f"Capacité maximale de la salle: {room.capacity}."}
            )

        if status_value == BookingStatus.CONFIRMED:
            conflicts = collision_queryset(room.id, start, end, exclude_booking_id=instance.pk)
            conflict = conflicts.first()
            if conflict:
                raise serializers.ValidationError(
                    {
                        "start_datetime": (
                            f"Conflit avec « {conflict.title} » "
                            f"({timezone.localtime(conflict.start_datetime):%d/%m/%Y %H:%M} - "
                            f"{timezone.localtime(conflict.end_datetime):%H:%M})."
                        )
                    }
                )
        return attrs


class SeriesUpdateSerializer(serializers.ModelSerializer):
    """
    Edits the descriptive fields of a series. Changes are propagated to the
    future occurrences; past ones keep the values they were booked with.
    """

    class Meta:
        model = BookingSeries
        fields = (
            "title",
            "purpose",
            "notes",
            "expected_attendees",
            "booked_by",
            "booked_by_name",
            "required_resources",
            "status",
        )

    def update(self, instance, validated_data):
        resources = validated_data.pop("required_resources", None)
        series = super().update(instance, validated_data)
        if resources is not None:
            series.required_resources.set(resources)

        future = series.occurrences.filter(start_datetime__gte=timezone.now())
        future.update(
            title=series.title,
            purpose=series.purpose,
            notes=series.notes,
            expected_attendees=series.expected_attendees,
            booked_by=series.booked_by,
            booked_by_name=series.booked_by_name,
        )
        if resources is not None:
            for booking in future:
                booking.required_resources.set(resources)
        if series.status == BookingStatus.CANCELLED:
            future.update(status=BookingStatus.CANCELLED)
        return series


class ConflictDetailSerializer(serializers.Serializer):
    start = serializers.DateTimeField()
    end = serializers.DateTimeField()
    conflicts = serializers.ListField(child=serializers.DictField())


class BookingCreationResultSerializer(serializers.Serializer):
    series = BookingSeriesSerializer(allow_null=True)
    created = BookingSerializer(many=True)
    created_count = serializers.IntegerField()
    skipped_count = serializers.IntegerField()
    skipped = ConflictDetailSerializer(many=True)
