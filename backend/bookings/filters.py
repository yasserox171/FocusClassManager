import django_filters as filters

from .models import Booking, BookingSeries


class BookingFilter(filters.FilterSet):
    room = filters.NumberFilter(field_name="room_id")
    rooms = filters.BaseInFilter(field_name="room_id", lookup_expr="in")
    booked_by = filters.NumberFilter(field_name="booked_by_id")
    series = filters.NumberFilter(field_name="series_id")
    status = filters.CharFilter(field_name="status")
    start_after = filters.IsoDateTimeFilter(field_name="start_datetime", lookup_expr="gte")
    start_before = filters.IsoDateTimeFilter(field_name="start_datetime", lookup_expr="lte")
    date = filters.DateFilter(method="filter_date", label="Bookings covering a given day")
    recurring = filters.BooleanFilter(method="filter_recurring")
    period = filters.CharFilter(method="filter_period", label="upcoming | past | today")

    class Meta:
        model = Booking
        fields = ("room", "status", "series", "booked_by")

    def filter_date(self, queryset, name, value):
        from datetime import time, timedelta

        from .services import combine

        start = combine(value, time.min)
        end = combine(value + timedelta(days=1), time.min)
        return queryset.in_range(start, end)

    def filter_recurring(self, queryset, name, value):
        return queryset.filter(series__isnull=not value)

    def filter_period(self, queryset, name, value):
        from datetime import time, timedelta

        from django.utils import timezone

        from .services import combine

        now = timezone.now()
        value = (value or "").lower()
        if value == "upcoming":
            return queryset.upcoming(now)
        if value == "past":
            return queryset.past(now)
        if value == "today":
            today = timezone.localdate()
            return queryset.in_range(
                combine(today, time.min), combine(today + timedelta(days=1), time.min)
            )
        return queryset


class BookingSeriesFilter(filters.FilterSet):
    class Meta:
        model = BookingSeries
        fields = ("room", "recurrence_type", "status", "booked_by")
