from django.core.validators import MinValueValidator, RegexValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from faas.models import SoftDeleteModel, TimeStampedModel


class RoomStatus(models.TextChoices):
    AVAILABLE = "available", _("Available")
    MAINTENANCE = "maintenance", _("Under maintenance")
    CLOSED = "closed", _("Closed")


class ResourceCondition(models.TextChoices):
    OK = "ok", _("Working")
    DAMAGED = "damaged", _("Damaged")
    MISSING = "missing", _("Missing")


class IssueStatus(models.TextChoices):
    OPEN = "open", _("Open")
    IN_PROGRESS = "in_progress", _("In progress")
    RESOLVED = "resolved", _("Resolved")


class ResourceType(TimeStampedModel):
    """
    Catalogue of everything a room can hold: chairs, whiteboards, projectors,
    air conditioners, lighting... Names are stored in both languages so the
    SPA never has to guess a translation for user created entries.
    """

    code = models.SlugField(_("code"), max_length=50, unique=True)
    name_fr = models.CharField(_("name (fr)"), max_length=120)
    name_ar = models.CharField(_("name (ar)"), max_length=120)
    icon = models.CharField(_("icon"), max_length=50, blank=True)
    is_countable = models.BooleanField(
        _("countable"),
        default=True,
        help_text=_("Chairs are counted, air conditioning is simply present or not."),
    )

    class Meta:
        verbose_name = _("resource type")
        verbose_name_plural = _("resource types")
        ordering = ("name_fr",)

    def __str__(self) -> str:
        return self.name_fr


class Room(SoftDeleteModel, TimeStampedModel):
    """A bookable room together with the resources it contains."""

    name = models.CharField(_("name"), max_length=150)
    name_ar = models.CharField(_("name (ar)"), max_length=150, blank=True)
    code = models.SlugField(_("code"), max_length=30, unique=True)
    capacity = models.PositiveIntegerField(_("capacity"), validators=[MinValueValidator(1)])
    location = models.CharField(_("location"), max_length=200, blank=True)
    description = models.TextField(_("description"), blank=True)
    status = models.CharField(
        _("status"), max_length=20, choices=RoomStatus.choices, default=RoomStatus.AVAILABLE
    )
    color = models.CharField(
        _("calendar colour"),
        max_length=7,
        default="#2563eb",
        validators=[RegexValidator(r"^#(?:[0-9a-fA-F]{3}){1,2}$", _("Enter a hex colour."))],
        help_text=_("Used to colour the room's events in the calendar."),
    )

    class Meta:
        verbose_name = _("room")
        verbose_name_plural = _("rooms")
        ordering = ("name",)
        indexes = [models.Index(fields=["status", "deleted_at"])]

    def __str__(self) -> str:
        return f"{self.name} ({self.code})"

    @property
    def is_bookable(self) -> bool:
        return self.status == RoomStatus.AVAILABLE and not self.is_deleted


class RoomResource(TimeStampedModel):
    """How many of a given resource a room holds, and in which condition."""

    room = models.ForeignKey(Room, related_name="resources", on_delete=models.CASCADE)
    resource_type = models.ForeignKey(
        ResourceType, related_name="room_resources", on_delete=models.PROTECT
    )
    quantity = models.PositiveIntegerField(_("quantity"), default=1)
    condition = models.CharField(
        _("condition"),
        max_length=20,
        choices=ResourceCondition.choices,
        default=ResourceCondition.OK,
    )
    notes = models.CharField(_("notes"), max_length=255, blank=True)

    class Meta:
        verbose_name = _("room resource")
        verbose_name_plural = _("room resources")
        ordering = ("resource_type__name_fr",)
        constraints = [
            models.UniqueConstraint(
                fields=["room", "resource_type"], name="unique_resource_per_room"
            )
        ]

    def __str__(self) -> str:
        return f"{self.room.code} - {self.resource_type.name_fr} x{self.quantity}"


class ResourceIssue(TimeStampedModel):
    """An incident reported by a room manager (broken projector, missing chairs...)."""

    room = models.ForeignKey(Room, related_name="issues", on_delete=models.CASCADE)
    room_resource = models.ForeignKey(
        RoomResource,
        related_name="issues",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    description = models.TextField(_("description"))
    status = models.CharField(
        _("status"), max_length=20, choices=IssueStatus.choices, default=IssueStatus.OPEN
    )
    reported_by = models.ForeignKey(
        "users.User",
        related_name="reported_issues",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    resolved_at = models.DateTimeField(_("resolved at"), null=True, blank=True)

    class Meta:
        verbose_name = _("resource issue")
        verbose_name_plural = _("resource issues")
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.room.code} - {self.get_status_display()}"
