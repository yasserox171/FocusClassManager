"""
Role based permission classes shared by every app.

Policy: the booking data of the centre is **public in read-only**. Anyone may
consult the rooms, the bookings, the staff directory and the statistics without
an account; only a system administrator may create, update or delete anything.
User accounts themselves stay private (see ``IsAdmin``).
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission


def is_admin(user) -> bool:
    """True for an authenticated administrator, safe on ``AnonymousUser``."""
    return bool(user and user.is_authenticated and getattr(user, "is_admin", False))


class IsAdmin(BasePermission):
    """Only system administrators - used for the private endpoints."""

    message = "Cette action est réservée aux administrateurs."

    def has_permission(self, request, view):
        return is_admin(request.user)


class PublicReadAdminWrite(BasePermission):
    """
    Anyone - signed in or not - may read; only an administrator may write.

    This is the single permission class behind every public resource: rooms,
    resource types, incidents, bookings, series, departments and employees.
    """

    message = "Seul un administrateur peut modifier cette ressource."

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return is_admin(request.user)

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)
