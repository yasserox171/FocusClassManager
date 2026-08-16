from django.db.models import Count
from rest_framework import viewsets

from users.permissions import CanManageEmployees, IsAdminOrReadOnly

from .models import Department, Employee
from .serializers import DepartmentSerializer, EmployeeSerializer


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.annotate(employees_count=Count("employees"))
    serializer_class = DepartmentSerializer
    permission_classes = [IsAdminOrReadOnly]
    search_fields = ("name", "name_ar", "code")
    ordering_fields = ("name", "code")
    pagination_class = None


class EmployeeViewSet(viewsets.ModelViewSet):
    """Staff directory. Deletion is a soft delete so booking history is kept."""

    queryset = Employee.objects.select_related("department", "user").prefetch_related(
        "managed_rooms"
    )
    serializer_class = EmployeeSerializer
    permission_classes = [CanManageEmployees]
    filterset_fields = ("role", "is_active", "department", "managed_rooms")
    search_fields = ("full_name", "email", "phone")
    ordering_fields = ("full_name", "role", "created_at")
