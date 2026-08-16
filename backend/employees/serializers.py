from rest_framework import serializers

from rooms.models import Room

from .models import Department, Employee


class DepartmentSerializer(serializers.ModelSerializer):
    employees_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Department
        fields = ("id", "name", "name_ar", "code", "employees_count")


class ManagedRoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = ("id", "name", "code", "color")


class EmployeeSerializer(serializers.ModelSerializer):
    managed_rooms_detail = ManagedRoomSerializer(source="managed_rooms", many=True, read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True, default="")
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True, default="")

    class Meta:
        model = Employee
        fields = (
            "id",
            "user",
            "username",
            "full_name",
            "email",
            "phone",
            "role",
            "role_display",
            "department",
            "department_name",
            "managed_rooms",
            "managed_rooms_detail",
            "is_active",
            "notes",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_email(self, value):
        if not value:
            return value
        qs = Employee.objects.filter(email__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Un employé utilise déjà cette adresse e-mail.")
        return value
