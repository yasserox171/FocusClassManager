"""
Booking domain logic: recurrence expansion, collision detection and the
transactional creation of a whole series.

Everything the API does with dates goes through this module so the rules stay
in one place and stay testable without HTTP.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from dateutil.relativedelta import relativedelta
from dateutil.rrule import DAILY, MONTHLY, WEEKLY, YEARLY, rrule
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from rooms.models import Room, RoomStatus

from .models import (
    Booking,
    BookingSeries,
    BookingStatus,
    ConflictPolicy,
    MonthlyMode,
    RecurrenceType,
)

FREQ_MAP = {
    RecurrenceType.DAILY: DAILY,
    RecurrenceType.WEEKLY: WEEKLY,
    RecurrenceType.MONTHLY: MONTHLY,
    RecurrenceType.YEARLY: YEARLY,
}


class RecurrenceError(ValueError):
    """Raised when a recurrence rule cannot produce any valid occurrence."""


# ---------------------------------------------------------------------------
# Date helpers
# ---------------------------------------------------------------------------
def make_aware(value: datetime) -> datetime:
    if timezone.is_naive(value):
        return timezone.make_aware(value, timezone.get_current_timezone())
    return value


def combine(day: date, moment: time) -> datetime:
    """Local-aware datetime for a (date, time) pair."""
    return make_aware(datetime.combine(day, moment))


def occurrence_window(day: date, start_time: time, end_time: time) -> tuple[datetime, datetime]:
    """
    Build the [start, end) window for one day.

    A booking whose end time is not after its start time is read as an
    overnight slot and ends the following day (22:00 -> 01:00).
    """
    start = combine(day, start_time)
    end_day = day if end_time > start_time else day + timedelta(days=1)
    return start, combine(end_day, end_time)


# ---------------------------------------------------------------------------
# Recurrence expansion
# ---------------------------------------------------------------------------
def expand_recurrence(
    *,
    recurrence_type: str,
    start_date: date,
    end_date: date,
    start_time: time,
    end_time: time,
    interval: int = 1,
    weekdays: list[int] | None = None,
    monthly_mode: str = MonthlyMode.DAY_OF_MONTH,
    month_days: list[int] | None = None,
    nth_week: int | None = None,
    yearly_dates: list[dict] | None = None,
    limit: int | None = None,
) -> list[tuple[datetime, datetime]]:
    """
    Turn a recurrence rule into the concrete list of ``(start, end)`` windows.

    ``end_date`` is inclusive: a rule ending on 31 March still produces the
    occurrence of 31 March. Weekly days, monthly day-of-month numbers and
    yearly month/day pairs all accept several values, so one series can cover
    several sessions per week / month / year at once.
    """
    if end_date < start_date:
        raise RecurrenceError("La date de fin doit être postérieure à la date de début.")

    limit = limit or getattr(settings, "MAX_RECURRENCE_OCCURRENCES", 400)
    interval = max(1, int(interval or 1))

    if recurrence_type == RecurrenceType.NONE:
        return [occurrence_window(start_date, start_time, end_time)]

    freq = FREQ_MAP.get(recurrence_type)
    if freq is None:
        raise RecurrenceError(f"Type de récurrence inconnu: {recurrence_type}")

    base_kwargs: dict = {
        "freq": freq,
        "interval": interval,
        "dtstart": datetime.combine(start_date, time.min),
        "until": datetime.combine(end_date, time.max),
    }

    if recurrence_type == RecurrenceType.WEEKLY:
        days = sorted({int(day) for day in (weekdays or [])})
        if not days:
            days = [start_date.weekday()]
        if any(day < 0 or day > 6 for day in days):
            raise RecurrenceError("Les jours de la semaine doivent être compris entre 0 et 6.")
        occurrences = list(rrule(byweekday=days, **base_kwargs))[:limit]

    elif recurrence_type == RecurrenceType.MONTHLY:
        if monthly_mode == MonthlyMode.NTH_WEEKDAY:
            days = sorted({int(day) for day in (weekdays or [])})
            if not days:
                days = [start_date.weekday()]
            if any(day < 0 or day > 6 for day in days):
                raise RecurrenceError("Les jours de la semaine doivent être compris entre 0 et 6.")
            position = nth_week or 1
            if position == 0:
                raise RecurrenceError("Le rang de la semaine ne peut pas être 0.")
            byweekday = [_nth_weekday(day, int(position)) for day in days]
            occurrences = list(rrule(byweekday=byweekday, **base_kwargs))[:limit]
        else:
            days = sorted({int(day) for day in (month_days or [])})
            if not days:
                days = [start_date.day]
            if any(day < 1 or day > 31 for day in days):
                raise RecurrenceError("Les jours du mois doivent être compris entre 1 et 31.")
            occurrences = list(rrule(bymonthday=days, **base_kwargs))[:limit]

    elif recurrence_type == RecurrenceType.YEARLY:
        pairs = yearly_dates or [{"month": start_date.month, "day": start_date.day}]
        seen: set[datetime] = set()
        merged: list[datetime] = []
        for pair in pairs:
            try:
                month, day = int(pair["month"]), int(pair["day"])
            except (KeyError, TypeError, ValueError) as exc:
                raise RecurrenceError("Date annuelle invalide.") from exc
            if not (1 <= month <= 12 and 1 <= day <= 31):
                raise RecurrenceError("Date annuelle invalide.")
            for item in rrule(bymonth=month, bymonthday=day, **base_kwargs):
                if item not in seen:
                    seen.add(item)
                    merged.append(item)
        occurrences = sorted(merged)[:limit]

    else:
        occurrences = list(rrule(**base_kwargs))[:limit]

    if not occurrences:
        raise RecurrenceError(
            "Cette règle de récurrence ne génère aucune date dans la période choisie."
        )
    return [occurrence_window(item.date(), start_time, end_time) for item in occurrences]


def _nth_weekday(weekday_index: int, position: int):
    from dateutil.rrule import FR, MO, SA, SU, TH, TU, WE

    weekdays = [MO, TU, WE, TH, FR, SA, SU]
    return weekdays[weekday_index](position)


def next_occurrence_after(series: BookingSeries, moment: datetime) -> datetime | None:
    """First future occurrence of a series, used by the notification engine."""
    upcoming = (
        series.occurrences.filter(status=BookingStatus.CONFIRMED, start_datetime__gte=moment)
        .order_by("start_datetime")
        .values_list("start_datetime", flat=True)
        .first()
    )
    return upcoming


# ---------------------------------------------------------------------------
# Collision detection
# ---------------------------------------------------------------------------
def collision_queryset(
    room_id: int,
    start_datetime: datetime,
    end_datetime: datetime,
    exclude_booking_id: int | None = None,
    exclude_series_id: int | None = None,
):
    """Confirmed bookings of ``room_id`` that overlap the given window."""
    queryset = (
        Booking.objects.active()
        .filter(room_id=room_id)
        .overlapping(start_datetime, end_datetime)
        .select_related("room")
    )
    if exclude_booking_id:
        queryset = queryset.exclude(pk=exclude_booking_id)
    if exclude_series_id:
        queryset = queryset.exclude(series_id=exclude_series_id)
    return queryset


def check_collision(
    room_id: int,
    start_datetime: datetime,
    end_datetime: datetime,
    exclude_booking_id: int | None = None,
    exclude_series_id: int | None = None,
) -> bool:
    """``True`` when the window is already taken in that room."""
    return collision_queryset(
        room_id, start_datetime, end_datetime, exclude_booking_id, exclude_series_id
    ).exists()


@dataclass
class OccurrenceConflict:
    start: datetime
    end: datetime
    conflicting: list[Booking] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "conflicts": [
                {
                    "id": booking.id,
                    "title": booking.title,
                    "room": booking.room.name,
                    "start": booking.start_datetime.isoformat(),
                    "end": booking.end_datetime.isoformat(),
                    "booked_by": booking.booked_by_name,
                }
                for booking in self.conflicting
            ],
        }


def find_conflicts(
    room_id: int,
    windows: list[tuple[datetime, datetime]],
    exclude_series_id: int | None = None,
    exclude_booking_id: int | None = None,
) -> list[OccurrenceConflict]:
    """Conflicts of every window against the database *and* against each other."""
    conflicts: list[OccurrenceConflict] = []
    for index, (start, end) in enumerate(windows):
        existing = list(
            collision_queryset(room_id, start, end, exclude_booking_id, exclude_series_id)
        )
        # Two occurrences of the same new series may also overlap each other
        # (an overnight daily slot, for instance).
        self_overlap = [
            other
            for position, other in enumerate(windows)
            if position != index and other[0] < end and other[1] > start
        ]
        if existing or self_overlap:
            conflict = OccurrenceConflict(start=start, end=end, conflicting=existing)
            conflicts.append(conflict)
    return conflicts


def room_blocking_reason(room: Room) -> str:
    if room.is_deleted:
        return "deleted"
    if room.status == RoomStatus.MAINTENANCE:
        return "maintenance"
    if room.status == RoomStatus.CLOSED:
        return "closed"
    return ""


def rooms_available_between(queryset, start: datetime, end: datetime):
    """
    For each room of ``queryset`` say whether it is free between start and end.

    Returns a list of ``(room, is_available, reason)``. ``reason`` is one of
    ``maintenance``, ``closed``, ``booked`` or an empty string.
    """
    rooms = list(queryset)
    busy_room_ids = set(
        Booking.objects.active()
        .filter(room__in=rooms)
        .overlapping(start, end)
        .values_list("room_id", flat=True)
    )
    results = []
    for room in rooms:
        reason = room_blocking_reason(room)
        if not reason and room.id in busy_room_ids:
            reason = "booked"
        results.append((room, reason == "", reason))
    return results


# ---------------------------------------------------------------------------
# Creation
# ---------------------------------------------------------------------------
@dataclass
class SeriesCreationResult:
    series: BookingSeries | None
    created: list[Booking]
    skipped: list[OccurrenceConflict]

    @property
    def created_count(self) -> int:
        return len(self.created)

    @property
    def skipped_count(self) -> int:
        return len(self.skipped)


class BookingConflictError(Exception):
    """Raised when a strict creation hits at least one conflict."""

    def __init__(self, conflicts: list[OccurrenceConflict]):
        self.conflicts = conflicts
        super().__init__("Conflit de réservation détecté.")


@transaction.atomic
def create_recurrent_bookings(
    *,
    room: Room,
    payload: dict,
    recurrence: dict,
    conflict_policy: str = ConflictPolicy.STRICT,
    created_by=None,
    required_resources: list | None = None,
) -> SeriesCreationResult:
    """
    Create a series and all of its occurrences.

    ``payload`` carries the booking fields shared by every occurrence
    (title, purpose, notes, expected_attendees, booked_by, booked_by_name).
    ``recurrence`` carries the rule (see :func:`expand_recurrence`).

    The rows of the room are locked for the duration of the transaction so two
    concurrent requests cannot both pass the collision check.
    """
    # Lock the room's confirmed bookings so a concurrent create cannot slip in
    # between the check and the insert.
    list(Booking.objects.select_for_update().filter(room=room, status=BookingStatus.CONFIRMED)[:1])

    windows = expand_recurrence(**recurrence)
    conflicts = find_conflicts(room.id, windows)

    if conflicts and conflict_policy == ConflictPolicy.STRICT:
        raise BookingConflictError(conflicts)

    conflicting_starts = {conflict.start for conflict in conflicts}
    free_windows = [window for window in windows if window[0] not in conflicting_starts]

    if not free_windows:
        raise BookingConflictError(conflicts)

    is_recurring = recurrence.get("recurrence_type", RecurrenceType.NONE) != RecurrenceType.NONE
    series = None
    if is_recurring:
        series = BookingSeries.objects.create(
            room=room,
            title=payload.get("title", ""),
            purpose=payload.get("purpose", ""),
            notes=payload.get("notes", ""),
            expected_attendees=payload.get("expected_attendees", 1),
            booked_by=payload.get("booked_by"),
            booked_by_name=payload.get("booked_by_name", ""),
            created_by=created_by,
            recurrence_type=recurrence["recurrence_type"],
            interval=recurrence.get("interval", 1),
            weekdays=recurrence.get("weekdays") or [],
            monthly_mode=recurrence.get("monthly_mode", MonthlyMode.DAY_OF_MONTH),
            month_days=recurrence.get("month_days") or [],
            nth_week=recurrence.get("nth_week"),
            yearly_dates=recurrence.get("yearly_dates") or [],
            start_date=recurrence["start_date"],
            end_date=recurrence["end_date"],
            start_time=recurrence["start_time"],
            end_time=recurrence["end_time"],
        )
        if required_resources:
            series.required_resources.set(required_resources)

    bookings = [
        Booking(
            series=series,
            room=room,
            title=payload.get("title", ""),
            purpose=payload.get("purpose", ""),
            notes=payload.get("notes", ""),
            expected_attendees=payload.get("expected_attendees", 1),
            booked_by=payload.get("booked_by"),
            booked_by_name=payload.get("booked_by_name", ""),
            created_by=created_by,
            start_datetime=start,
            end_datetime=end,
        )
        for start, end in free_windows
    ]
    created = Booking.objects.bulk_create(bookings)

    if required_resources:
        # bulk_create does not return usable m2m handles on every backend, so
        # re-read the rows we just inserted.
        for booking in Booking.objects.filter(
            room=room,
            series=series,
            start_datetime__in=[window[0] for window in free_windows],
        ):
            booking.required_resources.set(required_resources)

    return SeriesCreationResult(series=series, created=created, skipped=conflicts)


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------
def business_hours_in_range(start: date, end: date) -> float:
    """Theoretical opening hours between two dates, used as occupancy divisor."""
    hours_per_day = settings.BUSINESS_HOURS_END - settings.BUSINESS_HOURS_START
    days_open_per_week = settings.BUSINESS_DAYS_PER_WEEK
    total_days = (end - start).days + 1
    if total_days <= 0:
        return 0.0
    weeks = total_days / 7
    open_days = weeks * days_open_per_week
    return max(open_days * hours_per_day, 0.0)


def calculate_usage_stats(room_id: int | None, start_date: date, end_date: date) -> dict:
    """
    Usage of one room (or of every room when ``room_id`` is None) over a period:
    number of bookings, booked hours, occupancy rate and peak hours.
    """
    window_start = combine(start_date, time.min)
    window_end = combine(end_date + timedelta(days=1), time.min)

    queryset = Booking.objects.active().in_range(window_start, window_end)
    if room_id:
        queryset = queryset.filter(room_id=room_id)

    total_hours = 0.0
    hour_histogram: dict[int, float] = {}
    weekday_histogram: dict[int, int] = {}
    bookings_count = 0

    for booking in queryset.only("start_datetime", "end_datetime"):
        start = max(booking.start_datetime, window_start)
        end = min(booking.end_datetime, window_end)
        if end <= start:
            continue
        bookings_count += 1
        total_hours += (end - start).total_seconds() / 3600

        local_start = timezone.localtime(start)
        local_end = timezone.localtime(end)
        weekday_histogram[local_start.weekday()] = weekday_histogram.get(local_start.weekday(), 0) + 1

        cursor = local_start
        while cursor < local_end:
            next_hour = (cursor + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
            slice_end = min(next_hour, local_end)
            hour_histogram[cursor.hour] = hour_histogram.get(cursor.hour, 0) + (
                (slice_end - cursor).total_seconds() / 3600
            )
            cursor = slice_end

    capacity_hours = business_hours_in_range(start_date, end_date)
    if room_id is None:
        capacity_hours *= max(Room.objects.count(), 1)

    occupancy = round((total_hours / capacity_hours) * 100, 2) if capacity_hours else 0.0

    peak_hours = sorted(hour_histogram.items(), key=lambda item: item[1], reverse=True)[:5]

    return {
        "room_id": room_id,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "bookings_count": bookings_count,
        "booked_hours": round(total_hours, 2),
        "available_hours": round(capacity_hours, 2),
        "occupancy_rate": occupancy,
        "peak_hours": [
            {"hour": hour, "hours_booked": round(value, 2)} for hour, value in peak_hours
        ],
        "hour_histogram": [
            {"hour": hour, "hours_booked": round(hour_histogram.get(hour, 0.0), 2)}
            for hour in range(settings.BUSINESS_HOURS_START, settings.BUSINESS_HOURS_END)
        ],
        "weekday_histogram": [
            {"weekday": weekday, "bookings": weekday_histogram.get(weekday, 0)}
            for weekday in range(7)
        ],
    }


def month_range(reference: date, months_back: int = 11) -> list[tuple[date, date]]:
    """List of (first day, last day) tuples for the last ``months_back`` months."""
    first_of_month = reference.replace(day=1)
    ranges = []
    for offset in range(months_back, -1, -1):
        start = first_of_month - relativedelta(months=offset)
        end = start + relativedelta(months=1) - timedelta(days=1)
        ranges.append((start, end))
    return ranges
