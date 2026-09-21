from django.core.validators import MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from faas.models import TimeStampedModel


class RecurrenceType(models.TextChoices):
    NONE = "none", _("One-off")
    DAILY = "daily", _("Daily")
    WEEKLY = "weekly", _("Weekly")
    MONTHLY = "monthly", _("Monthly")
    YEARLY = "yearly", _("Yearly")


class MonthlyMode(models.TextChoices):
    DAY_OF_MONTH = "day_of_month", _("Same day number every month")
    NTH_WEEKDAY = "nth_weekday", _("Nth weekday of the month")


class BookingStatus(models.TextChoices):
    CONFIRMED = "confirmed", _("Confirmed")
    CANCELLED = "cancelled", _("Cancelled")


class ConflictPolicy(models.TextChoices):
    STRICT = "strict", _("Reject the whole series on any conflict")
    SKIP = "skip", _("Create the free dates and skip the conflicting ones")


WEEKDAY_CHOICES = {
    0: "monday",
    1: "tuesday",
    2: "wednesday",
    3: "thursday",
    4: "friday",
    5: "saturday",
    6: "sunday",
}
WEEKDAY_NAME_TO_INDEX = {name: index for index, name in WEEKDAY_CHOICES.items()}


class BookingSeries(TimeStampedModel):
    """
    The recurrence rule behind a set of bookings. A one-off booking has no
    series; every recurring booking points back to the series that produced it,
    which is what makes "delete the whole series" possible.
    """

    room = models.ForeignKey("rooms.Room", related_name="booking_series", on_delete=models.CASCADE)
    title = models.CharField(_("title"), max_length=200)
    purpose = models.TextField(_("purpose"), blank=True)
    notes = models.TextField(_("notes"), blank=True)
    expected_attendees = models.PositiveIntegerField(_("expected attendees"), default=1)

    booked_by = models.ForeignKey(
        "employees.Employee",
        related_name="booking_series",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    booked_by_name = models.CharField(_("booked by"), max_length=150, blank=True)
    created_by = models.ForeignKey(
        "users.User",
        related_name="booking_series",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    recurrence_type = models.CharField(
        _("recurrence"),
        max_length=20,
        choices=RecurrenceType.choices,
        default=RecurrenceType.WEEKLY,
    )
    interval = models.PositiveIntegerField(
        _("interval"),
        default=1,
        validators=[MinValueValidator(1)],
        help_text=_("Every N days / weeks / months / years."),
    )
    weekdays = models.JSONField(
        _("weekdays"),
        default=list,
        blank=True,
        help_text=_("Weekly recurrences: 0 = Monday ... 6 = Sunday."),
    )
    monthly_mode = models.CharField(
        _("monthly mode"),
        max_length=20,
        choices=MonthlyMode.choices,
        default=MonthlyMode.DAY_OF_MONTH,
    )
    month_days = models.JSONField(
        _("days of month"),
        default=list,
        blank=True,
        help_text=_("Monthly 'day of month' mode: which day numbers (1-31), several allowed."),
    )
    nth_week = models.SmallIntegerField(
        _("nth week"),
        null=True,
        blank=True,
        help_text=_("1 = first, 2 = second ... -1 = last week of the month."),
    )
    yearly_dates = models.JSONField(
        _("yearly dates"),
        default=list,
        blank=True,
        help_text=_("Yearly recurrences: list of {month, day} pairs, several allowed."),
    )

    start_date = models.DateField(_("start date"))
    end_date = models.DateField(_("end date"))
    start_time = models.TimeField(_("start time"))
    end_time = models.TimeField(_("end time"))

    required_resources = models.ManyToManyField(
        "rooms.ResourceType", related_name="booking_series", blank=True
    )
    status = models.CharField(
        _("status"), max_length=20, choices=BookingStatus.choices, default=BookingStatus.CONFIRMED
    )

    class Meta:
        verbose_name = _("booking series")
        verbose_name_plural = _("booking series")
        ordering = ("-start_date",)

    def __str__(self) -> str:
        return f"{self.title} - {self.get_recurrence_type_display()}"

    @property
    def weekday_names(self) -> list[str]:
        return [WEEKDAY_CHOICES[day] for day in sorted(self.weekdays or []) if day in WEEKDAY_CHOICES]


class BookingQuerySet(models.QuerySet):
    def active(self):
        return self.filter(status=BookingStatus.CONFIRMED)

    def overlapping(self, start, end):
        """Half-open interval overlap: back-to-back bookings do not collide."""
        return self.filter(start_datetime__lt=end, end_datetime__gt=start)

    def in_range(self, start, end):
        return self.filter(start_datetime__lt=end, end_datetime__gt=start)

    def upcoming(self, now):
        return self.filter(start_datetime__gte=now)

    def past(self, now):
        return self.filter(end_datetime__lt=now)


class Booking(TimeStampedModel):
    """One concrete occupation of a room between two instants."""

    series = models.ForeignKey(
        BookingSeries,
        related_name="occurrences",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    room = models.ForeignKey("rooms.Room", related_name="bookings", on_delete=models.PROTECT)
    title = models.CharField(_("title"), max_length=200)
    purpose = models.TextField(_("purpose"), blank=True)
    notes = models.TextField(_("notes"), blank=True)
    expected_attendees = models.PositiveIntegerField(_("expected attendees"), default=1)

    start_datetime = models.DateTimeField(_("start"), db_index=True)
    end_datetime = models.DateTimeField(_("end"), db_index=True)

    booked_by = models.ForeignKey(
        "employees.Employee",
        related_name="bookings",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    booked_by_name = models.CharField(_("booked by"), max_length=150, blank=True)
    created_by = models.ForeignKey(
        "users.User",
        related_name="bookings",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    required_resources = models.ManyToManyField(
        "rooms.ResourceType", related_name="bookings", blank=True
    )
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=BookingStatus.choices,
        default=BookingStatus.CONFIRMED,
        db_index=True,
    )
    cancellation_reason = models.CharField(_("cancellation reason"), max_length=255, blank=True)

    objects = BookingQuerySet.as_manager()

    class Meta:
        verbose_name = _("booking")
        verbose_name_plural = _("bookings")
        ordering = ("start_datetime",)
        indexes = [
            models.Index(fields=["room", "start_datetime", "end_datetime"]),
            models.Index(fields=["status", "start_datetime"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(end_datetime__gt=models.F("start_datetime")),
                name="booking_end_after_start",
            )
        ]

    def __str__(self) -> str:
        return f"{self.room.code} {self.start_datetime:%Y-%m-%d %H:%M} - {self.title}"

    @property
    def is_recurring(self) -> bool:
        return self.series_id is not None

    @property
    def duration_hours(self) -> float:
        return (self.end_datetime - self.start_datetime).total_seconds() / 3600
