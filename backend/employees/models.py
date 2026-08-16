from django.db import models
from django.utils.translation import gettext_lazy as _

from faas.models import SoftDeleteModel, TimeStampedModel
from users.models import Role


class Department(TimeStampedModel):
    name = models.CharField(_("name"), max_length=120, unique=True)
    name_ar = models.CharField(_("name (ar)"), max_length=120, blank=True)
    code = models.SlugField(_("code"), max_length=30, unique=True)

    class Meta:
        verbose_name = _("department")
        verbose_name_plural = _("departments")
        ordering = ("name",)

    def __str__(self) -> str:
        return self.name


class Employee(SoftDeleteModel, TimeStampedModel):
    """
    A member of staff. Optionally linked to a ``User`` account: people who only
    appear as a booking contact do not need to be able to sign in.
    """

    user = models.OneToOneField(
        "users.User",
        related_name="employee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    full_name = models.CharField(_("full name"), max_length=150)
    email = models.EmailField(_("email"), blank=True)
    phone = models.CharField(_("phone"), max_length=30, blank=True)
    role = models.CharField(
        _("role"), max_length=32, choices=Role.choices, default=Role.STAFF
    )
    department = models.ForeignKey(
        Department,
        related_name="employees",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    managed_rooms = models.ManyToManyField(
        "rooms.Room", related_name="managers", blank=True, verbose_name=_("managed rooms")
    )
    is_active = models.BooleanField(_("active"), default=True)
    notes = models.TextField(_("notes"), blank=True)

    class Meta:
        verbose_name = _("employee")
        verbose_name_plural = _("employees")
        ordering = ("full_name",)
        indexes = [models.Index(fields=["role", "is_active"])]

    def __str__(self) -> str:
        return self.full_name
