"""Role based permission classes shared by every app."""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Role


class IsAdmin(BasePermission):
    """Only system administrators."""

    message = "Cette action est réservée aux administrateurs."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_admin)


class IsAdminOrReadOnly(BasePermission):
    """Everybody authenticated may read, only admins may write."""

    message = "Seul un administrateur peut modifier cette ressource."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.is_admin


class CanManageEmployees(BasePermission):
    """Admins manage employees; department managers may read them."""

    message = "Vous n'avez pas le droit de gérer les employés."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return user.is_admin or user.is_department_manager
        return user.is_admin


class CanManageBooking(BasePermission):
    """
    Booking authorization:

    * anyone authenticated may list/read bookings and create new ones,
    * a booking may only be updated or deleted by an admin, its author, or the
      manager of the room it belongs to.
    """

    message = "Vous ne pouvez modifier que vos propres réservations."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if request.method in SAFE_METHODS or user.is_admin:
            return True
        room_id = getattr(obj, "room_id", None)
        if room_id is not None and room_id in user.managed_room_ids:
            return True
        return obj.created_by_id == user.id


class CanReportResourceIssue(BasePermission):
    """Room managers report issues on their rooms, admins on any room."""

    message = "Vous ne pouvez signaler un incident que sur vos salles."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return user.is_admin or user.role in {Role.ROOM_MANAGER, Role.DEPARTMENT_MANAGER}
