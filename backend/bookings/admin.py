from django.contrib import admin

from .models import Booking, BookingSeries


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ("title", "room", "start_datetime", "end_datetime", "booked_by_name", "status")
    list_filter = ("status", "room")
    search_fields = ("title", "purpose", "booked_by_name")
    date_hierarchy = "start_datetime"
    autocomplete_fields = ("room",)


@admin.register(BookingSeries)
class BookingSeriesAdmin(admin.ModelAdmin):
    list_display = ("title", "room", "recurrence_type", "start_date", "end_date", "status")
    list_filter = ("recurrence_type", "status")
    search_fields = ("title", "purpose")
