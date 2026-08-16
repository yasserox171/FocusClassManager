from django.db import models
from django.utils.translation import gettext_lazy as _

from faas.models import TimeStampedModel


class NotificationLevel(models.TextChoices):
    INFO = "info", _("Information")
    WARNING = "warning", _("Warning")
    CRITICAL = "critical", _("Critical")


class NotificationCategory(models.TextChoices):
    BOOKING_CREATED = "booking_created", _("Booking created")
    BOOKING_CANCELLED = "booking_cancelled", _("Booking cancelled")
    BOOKING_CONFLICT = "booking_conflict", _("Booking conflict")
    BOOKING_REMINDER = "booking_reminder", _("Upcoming booking")
    ROOM_MAINTENANCE = "room_maintenance", _("Room under maintenance")
    RESOURCE_ISSUE = "resource_issue", _("Resource issue")


class Notification(TimeStampedModel):
    """
    Stored notification. Messages are kept in both languages so the SPA can
    switch language without re-fetching or re-computing anything.
    """

    category = models.CharField(_("category"), max_length=32, choices=NotificationCategory.choices)
    level = models.CharField(
        _("level"), max_length=16, choices=NotificationLevel.choices, default=NotificationLevel.INFO
    )
    message_fr = models.CharField(_("message (fr)"), max_length=255)
    message_ar = models.CharField(_("message (ar)"), max_length=255)

    room = models.ForeignKey(
        "rooms.Room", related_name="notifications", on_delete=models.CASCADE, null=True, blank=True
    )
    booking = models.ForeignKey(
        "bookings.Booking",
        related_name="notifications",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    recipient = models.ForeignKey(
        "users.User",
        related_name="notifications",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        help_text=_("Empty means the notification is broadcast to every user."),
    )
    is_read = models.BooleanField(_("read"), default=False)

    class Meta:
        verbose_name = _("notification")
        verbose_name_plural = _("notifications")
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["is_read", "-created_at"])]

    def __str__(self) -> str:
        return f"[{self.level}] {self.message_fr}"
