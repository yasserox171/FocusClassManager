"""Live alerts computed on demand plus helpers to persist notifications."""

from datetime import timedelta

from django.utils import timezone

from bookings.models import Booking
from rooms.models import IssueStatus, ResourceIssue, Room, RoomStatus

from .models import Notification, NotificationCategory, NotificationLevel


def notify(
    *,
    category: str,
    message_fr: str,
    message_ar: str,
    level: str = NotificationLevel.INFO,
    room=None,
    booking=None,
    recipient=None,
) -> Notification:
    return Notification.objects.create(
        category=category,
        level=level,
        message_fr=message_fr,
        message_ar=message_ar,
        room=room,
        booking=booking,
        recipient=recipient,
    )


def build_alerts(user=None, reminder_hours: int = 24) -> list[dict]:
    """
    Alerts derived from the current state of the system - nothing is stored:

    * rooms under maintenance or closed,
    * open resource issues,
    * bookings starting within ``reminder_hours``,
    * overlapping confirmed bookings (data that should never exist).
    """
    now = timezone.now()
    alerts: list[dict] = []

    for room in Room.objects.exclude(status=RoomStatus.AVAILABLE):
        alerts.append(
            {
                "id": f"room-{room.id}",
                "category": NotificationCategory.ROOM_MAINTENANCE,
                "level": (
                    NotificationLevel.WARNING
                    if room.status == RoomStatus.MAINTENANCE
                    else NotificationLevel.CRITICAL
                ),
                "message_fr": f"La salle « {room.name} » est {room.get_status_display().lower()}.",
                "message_ar": f"القاعة « {room.name} » غير متاحة حالياً.",
                "room_id": room.id,
                "booking_id": None,
                "created_at": room.updated_at.isoformat(),
            }
        )

    issues = ResourceIssue.objects.filter(
        status__in=[IssueStatus.OPEN, IssueStatus.IN_PROGRESS]
    ).select_related("room")
    for issue in issues:
        alerts.append(
            {
                "id": f"issue-{issue.id}",
                "category": NotificationCategory.RESOURCE_ISSUE,
                "level": NotificationLevel.WARNING,
                "message_fr": f"{issue.room.name}: {issue.description[:120]}",
                "message_ar": f"{issue.room.name}: {issue.description[:120]}",
                "room_id": issue.room_id,
                "booking_id": None,
                "created_at": issue.created_at.isoformat(),
            }
        )

    horizon = now + timedelta(hours=reminder_hours)
    upcoming = (
        Booking.objects.active()
        .filter(start_datetime__gte=now, start_datetime__lte=horizon)
        .select_related("room")
        .order_by("start_datetime")[:20]
    )
    if user is not None and not user.is_admin:
        managed = user.managed_room_ids
        if managed:
            upcoming = [item for item in upcoming if item.room_id in managed]
    for booking in upcoming:
        local_start = timezone.localtime(booking.start_datetime)
        alerts.append(
            {
                "id": f"booking-{booking.id}",
                "category": NotificationCategory.BOOKING_REMINDER,
                "level": NotificationLevel.INFO,
                "message_fr": (
                    f"« {booking.title} » dans « {booking.room.name} » "
                    f"le {local_start:%d/%m/%Y à %H:%M}."
                ),
                "message_ar": (
                    f"« {booking.title} » في القاعة « {booking.room.name} » "
                    f"يوم {local_start:%Y/%m/%d} على الساعة {local_start:%H:%M}."
                ),
                "room_id": booking.room_id,
                "booking_id": booking.id,
                "created_at": booking.created_at.isoformat(),
            }
        )

    for overlap in detect_overlaps():
        alerts.append(overlap)

    return alerts


def detect_overlaps(limit: int = 50) -> list[dict]:
    """
    Safety net: report confirmed bookings that overlap in the same room.

    Creation is guarded against conflicts, so a hit here means the data was
    edited outside the API (admin, import, direct SQL).
    """
    results: list[dict] = []
    bookings = list(
        Booking.objects.active()
        .filter(end_datetime__gte=timezone.now())
        .select_related("room")
        .order_by("room_id", "start_datetime")[: limit * 20]
    )
    for index, booking in enumerate(bookings):
        for other in bookings[index + 1 :]:
            if other.room_id != booking.room_id:
                break
            if other.start_datetime >= booking.end_datetime:
                break
            results.append(
                {
                    "id": f"conflict-{booking.id}-{other.id}",
                    "category": NotificationCategory.BOOKING_CONFLICT,
                    "level": NotificationLevel.CRITICAL,
                    "message_fr": (
                        f"Conflit dans « {booking.room.name} » entre "
                        f"« {booking.title} » et « {other.title} »."
                    ),
                    "message_ar": (
                        f"تعارض في القاعة « {booking.room.name} » بين "
                        f"« {booking.title} » و « {other.title} »."
                    ),
                    "room_id": booking.room_id,
                    "booking_id": booking.id,
                    "created_at": timezone.now().isoformat(),
                }
            )
            if len(results) >= limit:
                return results
    return results
