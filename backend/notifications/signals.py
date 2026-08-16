"""Notifications and cache invalidation triggered by domain events."""

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver
from django.utils import timezone

from bookings.models import Booking, BookingStatus
from faas.cache import bump_analytics_version
from rooms.models import ResourceIssue, Room

from .models import NotificationCategory, NotificationLevel
from .services import notify


@receiver(post_save, sender=Booking)
def booking_saved(sender, instance: Booking, created, **kwargs):
    bump_analytics_version()

    # Only the first occurrence of a series raises a notification, otherwise a
    # year of weekly lectures would flood the bell menu.
    if created and instance.series_id:
        is_first = (
            not Booking.objects.filter(series_id=instance.series_id)
            .exclude(pk=instance.pk)
            .exists()
        )
        if not is_first:
            return

    local_start = timezone.localtime(instance.start_datetime)
    if created:
        notify(
            category=NotificationCategory.BOOKING_CREATED,
            level=NotificationLevel.INFO,
            message_fr=(
                f"Nouvelle réservation « {instance.title} » dans « {instance.room.name} » "
                f"le {local_start:%d/%m/%Y à %H:%M}."
            ),
            message_ar=(
                f"حجز جديد « {instance.title} » في القاعة « {instance.room.name} » "
                f"يوم {local_start:%Y/%m/%d} على الساعة {local_start:%H:%M}."
            ),
            room=instance.room,
            booking=instance,
        )
    elif instance.status == BookingStatus.CANCELLED:
        notify(
            category=NotificationCategory.BOOKING_CANCELLED,
            level=NotificationLevel.WARNING,
            message_fr=(
                f"Réservation annulée: « {instance.title} » "
                f"({instance.room.name}, {local_start:%d/%m/%Y %H:%M})."
            ),
            message_ar=(
                f"تم إلغاء الحجز: « {instance.title} » "
                f"({instance.room.name}، {local_start:%Y/%m/%d %H:%M})."
            ),
            room=instance.room,
            booking=instance,
        )


@receiver(post_delete, sender=Booking)
def booking_deleted(sender, instance, **kwargs):
    bump_analytics_version()


@receiver(post_save, sender=Room)
def room_saved(sender, instance: Room, created, **kwargs):
    bump_analytics_version()


@receiver(post_save, sender=ResourceIssue)
def issue_reported(sender, instance: ResourceIssue, created, **kwargs):
    if not created:
        return
    notify(
        category=NotificationCategory.RESOURCE_ISSUE,
        level=NotificationLevel.WARNING,
        message_fr=f"Incident signalé dans « {instance.room.name} »: {instance.description[:120]}",
        message_ar=f"عطل في القاعة « {instance.room.name} »: {instance.description[:120]}",
        room=instance.room,
    )
