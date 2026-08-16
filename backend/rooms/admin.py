from django.contrib import admin

from .models import ResourceIssue, ResourceType, Room, RoomResource


class RoomResourceInline(admin.TabularInline):
    model = RoomResource
    extra = 1


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "capacity", "location", "status", "deleted_at")
    list_filter = ("status",)
    search_fields = ("name", "code", "location")
    inlines = [RoomResourceInline]

    def get_queryset(self, request):
        return Room.all_objects.all()


@admin.register(ResourceType)
class ResourceTypeAdmin(admin.ModelAdmin):
    list_display = ("code", "name_fr", "name_ar", "is_countable")
    search_fields = ("code", "name_fr", "name_ar")


@admin.register(ResourceIssue)
class ResourceIssueAdmin(admin.ModelAdmin):
    list_display = ("room", "status", "reported_by", "created_at", "resolved_at")
    list_filter = ("status",)
