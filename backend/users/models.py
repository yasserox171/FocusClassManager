from django.contrib.auth.models import AbstractUser, UserManager as DjangoUserManager
from django.db import models
from django.utils.translation import gettext_lazy as _


class Role(models.TextChoices):
    """Application roles - drives every permission check in the project."""

    ADMIN = "admin", _("System administrator")
    DEPARTMENT_MANAGER = "department_manager", _("Department manager")
    ROOM_MANAGER = "room_manager", _("Room manager")
    STAFF = "staff", _("Administrative staff")


class Language(models.TextChoices):
    ARABIC = "ar", _("Arabic")
    FRENCH = "fr", _("French")


class UserManager(DjangoUserManager):
    def create_superuser(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault("role", Role.ADMIN)
        return super().create_superuser(username, email, password, **extra_fields)


class User(AbstractUser):
    """Custom user - authentication plus the role used for authorization."""

    email = models.EmailField(_("email address"), unique=True)
    phone = models.CharField(_("phone"), max_length=30, blank=True)
    role = models.CharField(
        _("role"), max_length=32, choices=Role.choices, default=Role.STAFF
    )
    preferred_language = models.CharField(
        _("preferred language"),
        max_length=2,
        choices=Language.choices,
        default=Language.FRENCH,
    )

    objects = UserManager()

    class Meta:
        verbose_name = _("user")
        verbose_name_plural = _("users")
        ordering = ("first_name", "last_name", "username")

    def __str__(self) -> str:
        return self.get_full_name() or self.username

    # -- role helpers -------------------------------------------------------
    @property
    def is_admin(self) -> bool:
        return self.is_superuser or self.role == Role.ADMIN

    @property
    def is_department_manager(self) -> bool:
        return self.role == Role.DEPARTMENT_MANAGER

    @property
    def is_room_manager(self) -> bool:
        return self.role == Role.ROOM_MANAGER

    @property
    def managed_room_ids(self) -> list[int]:
        """Rooms this user is responsible for, through their employee record."""
        employee = getattr(self, "employee", None)
        if employee is None:
            return []
        return list(employee.managed_rooms.values_list("id", flat=True))
