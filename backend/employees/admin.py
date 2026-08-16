from django.contrib import admin

from .models import Department, Employee


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ("full_name", "role", "department", "email", "phone", "is_active")
    list_filter = ("role", "is_active", "department")
    search_fields = ("full_name", "email", "phone")
    filter_horizontal = ("managed_rooms",)


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "code")
