from django.db.models import Count
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from users.models import Role
from users.permissions import PublicReadAdminWrite

from .models import Department, Employee
from .serializers import DepartmentSerializer, EmployeeSerializer


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.annotate(employees_count=Count("employees"))
    serializer_class = DepartmentSerializer
    permission_classes = [PublicReadAdminWrite]
    search_fields = ("name", "name_ar", "code")
    ordering_fields = ("name", "code")
    pagination_class = None


class EmployeeViewSet(viewsets.ModelViewSet):
    """Staff directory. Deletion is a soft delete so booking history is kept."""

    queryset = Employee.objects.select_related("department", "user").prefetch_related(
        "managed_rooms"
    )
    serializer_class = EmployeeSerializer
    permission_classes = [PublicReadAdminWrite]
    filterset_fields = ("role", "is_active", "department", "managed_rooms")
    search_fields = ("full_name", "email", "phone")
    ordering_fields = ("full_name", "role", "created_at")

    @extend_schema(responses=EmployeeSerializer(many=True))
    @action(detail=False, methods=["get"], url_path="teachers")
    def teachers(self, request):
        """
        The active teachers, unpaginated.

        The booking form and the booking filters both need the whole list at
        once to fill their selector, so this skips pagination on purpose.
        """
        queryset = self.filter_queryset(
            self.get_queryset().filter(role=Role.TEACHER, is_active=True)
        ).order_by("full_name")
        return Response(EmployeeSerializer(queryset, many=True).data)
