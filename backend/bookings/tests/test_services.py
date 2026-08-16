from datetime import date, time, timedelta

from django.test import TestCase
from django.utils import timezone

from bookings.models import Booking, MonthlyMode, RecurrenceType
from bookings.services import (
    RecurrenceError,
    check_collision,
    combine,
    create_recurrent_bookings,
    expand_recurrence,
    find_conflicts,
    occurrence_window,
    rooms_available_between,
)
from rooms.models import Room, RoomStatus


class ExpandRecurrenceTests(TestCase):
    def test_one_off_returns_single_window(self):
        windows = expand_recurrence(
            recurrence_type=RecurrenceType.NONE,
            start_date=date(2025, 1, 13),
            end_date=date(2025, 1, 13),
            start_time=time(8, 0),
            end_time=time(10, 0),
        )
        self.assertEqual(len(windows), 1)
        start, end = windows[0]
        self.assertEqual(timezone.localtime(start).hour, 8)
        self.assertEqual(timezone.localtime(end).hour, 10)

    def test_weekly_on_monday_and_thursday(self):
        """The example from the specification: 13 Jan -> 31 Mar 2025, Mon + Thu."""
        windows = expand_recurrence(
            recurrence_type=RecurrenceType.WEEKLY,
            start_date=date(2025, 1, 13),
            end_date=date(2025, 3, 31),
            start_time=time(8, 0),
            end_time=time(10, 0),
            weekdays=[0, 3],
        )
        days = [timezone.localtime(start).date() for start, _ in windows]
        self.assertEqual(days[0], date(2025, 1, 13))
        self.assertEqual(days[1], date(2025, 1, 16))
        self.assertEqual(days[2], date(2025, 1, 20))
        self.assertEqual(days[-1], date(2025, 3, 31))
        self.assertTrue(all(day.weekday() in (0, 3) for day in days))
        self.assertEqual(len(days), 23)

    def test_daily_with_interval(self):
        windows = expand_recurrence(
            recurrence_type=RecurrenceType.DAILY,
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 10),
            start_time=time(9, 0),
            end_time=time(10, 0),
            interval=3,
        )
        days = [timezone.localtime(start).date().day for start, _ in windows]
        self.assertEqual(days, [1, 4, 7, 10])

    def test_monthly_by_day_of_month(self):
        windows = expand_recurrence(
            recurrence_type=RecurrenceType.MONTHLY,
            start_date=date(2025, 1, 15),
            end_date=date(2025, 4, 30),
            start_time=time(14, 0),
            end_time=time(16, 0),
            monthly_mode=MonthlyMode.DAY_OF_MONTH,
            month_day=15,
        )
        days = [timezone.localtime(start).date() for start, _ in windows]
        self.assertEqual(
            days, [date(2025, 1, 15), date(2025, 2, 15), date(2025, 3, 15), date(2025, 4, 15)]
        )

    def test_monthly_nth_weekday(self):
        """First Monday of each month."""
        windows = expand_recurrence(
            recurrence_type=RecurrenceType.MONTHLY,
            start_date=date(2025, 1, 1),
            end_date=date(2025, 3, 31),
            start_time=time(9, 0),
            end_time=time(11, 0),
            monthly_mode=MonthlyMode.NTH_WEEKDAY,
            weekdays=[0],
            nth_week=1,
        )
        days = [timezone.localtime(start).date() for start, _ in windows]
        self.assertEqual(days, [date(2025, 1, 6), date(2025, 2, 3), date(2025, 3, 3)])

    def test_yearly(self):
        windows = expand_recurrence(
            recurrence_type=RecurrenceType.YEARLY,
            start_date=date(2025, 9, 1),
            end_date=date(2028, 12, 31),
            start_time=time(8, 0),
            end_time=time(12, 0),
        )
        days = [timezone.localtime(start).date() for start, _ in windows]
        self.assertEqual(days, [date(2025, 9, 1), date(2026, 9, 1), date(2027, 9, 1), date(2028, 9, 1)])

    def test_overnight_window_ends_next_day(self):
        start, end = occurrence_window(date(2025, 1, 1), time(22, 0), time(1, 0))
        self.assertEqual(timezone.localtime(end).date(), date(2025, 1, 2))
        self.assertGreater(end, start)

    def test_end_before_start_is_rejected(self):
        with self.assertRaises(RecurrenceError):
            expand_recurrence(
                recurrence_type=RecurrenceType.WEEKLY,
                start_date=date(2025, 3, 1),
                end_date=date(2025, 1, 1),
                start_time=time(8, 0),
                end_time=time(9, 0),
                weekdays=[0],
            )

    def test_occurrence_cap_is_enforced(self):
        windows = expand_recurrence(
            recurrence_type=RecurrenceType.DAILY,
            start_date=date(2025, 1, 1),
            end_date=date(2030, 1, 1),
            start_time=time(8, 0),
            end_time=time(9, 0),
            limit=10,
        )
        self.assertEqual(len(windows), 10)


class CollisionTests(TestCase):
    def setUp(self):
        self.room = Room.objects.create(name="Salle A", code="a", capacity=30)
        self.other = Room.objects.create(name="Salle B", code="b", capacity=20)
        self.start = combine(date(2025, 5, 5), time(9, 0))
        self.end = combine(date(2025, 5, 5), time(11, 0))
        Booking.objects.create(
            room=self.room,
            title="Cours de maths",
            start_datetime=self.start,
            end_datetime=self.end,
        )

    def test_exact_overlap_collides(self):
        self.assertTrue(check_collision(self.room.id, self.start, self.end))

    def test_partial_overlap_collides(self):
        self.assertTrue(
            check_collision(
                self.room.id,
                combine(date(2025, 5, 5), time(10, 0)),
                combine(date(2025, 5, 5), time(12, 0)),
            )
        )

    def test_enclosing_window_collides(self):
        self.assertTrue(
            check_collision(
                self.room.id,
                combine(date(2025, 5, 5), time(8, 0)),
                combine(date(2025, 5, 5), time(13, 0)),
            )
        )

    def test_back_to_back_does_not_collide(self):
        """11:00-12:00 right after a 09:00-11:00 booking is legal."""
        self.assertFalse(
            check_collision(
                self.room.id,
                combine(date(2025, 5, 5), time(11, 0)),
                combine(date(2025, 5, 5), time(12, 0)),
            )
        )

    def test_other_room_does_not_collide(self):
        self.assertFalse(check_collision(self.other.id, self.start, self.end))

    def test_cancelled_booking_frees_the_slot(self):
        Booking.objects.update(status="cancelled")
        self.assertFalse(check_collision(self.room.id, self.start, self.end))

    def test_exclude_booking_ignores_itself(self):
        booking = Booking.objects.first()
        self.assertFalse(
            check_collision(self.room.id, self.start, self.end, exclude_booking_id=booking.id)
        )

    def test_find_conflicts_reports_self_overlap(self):
        window = (
            combine(date(2025, 6, 1), time(22, 0)),
            combine(date(2025, 6, 2), time(2, 0)),
        )
        overlapping = (
            combine(date(2025, 6, 2), time(1, 0)),
            combine(date(2025, 6, 2), time(3, 0)),
        )
        conflicts = find_conflicts(self.other.id, [window, overlapping])
        self.assertEqual(len(conflicts), 2)

    def test_rooms_available_between_flags_reasons(self):
        self.other.status = RoomStatus.MAINTENANCE
        self.other.save()
        results = dict(
            (room.id, (available, reason))
            for room, available, reason in rooms_available_between(
                Room.objects.all(), self.start, self.end
            )
        )
        self.assertEqual(results[self.room.id], (False, "booked"))
        self.assertEqual(results[self.other.id], (False, "maintenance"))


class CreateRecurrentBookingsTests(TestCase):
    def setUp(self):
        self.room = Room.objects.create(name="Salle C", code="c", capacity=40)

    def _recurrence(self, **overrides):
        base = {
            "recurrence_type": RecurrenceType.WEEKLY,
            "start_date": date(2025, 1, 13),
            "end_date": date(2025, 2, 13),
            "start_time": time(8, 0),
            "end_time": time(10, 0),
            "weekdays": [0, 3],
        }
        base.update(overrides)
        return base

    def test_series_creates_every_occurrence(self):
        result = create_recurrent_bookings(
            room=self.room,
            payload={"title": "Maths", "expected_attendees": 25},
            recurrence=self._recurrence(),
        )
        self.assertIsNotNone(result.series)
        self.assertEqual(result.created_count, Booking.objects.count())
        self.assertEqual(result.skipped_count, 0)
        self.assertTrue(all(item.series_id == result.series.id for item in result.created))

    def test_one_off_creates_no_series(self):
        result = create_recurrent_bookings(
            room=self.room,
            payload={"title": "Réunion"},
            recurrence=self._recurrence(
                recurrence_type=RecurrenceType.NONE, end_date=date(2025, 1, 13)
            ),
        )
        self.assertIsNone(result.series)
        self.assertEqual(result.created_count, 1)

    def test_strict_policy_rejects_the_whole_series(self):
        from bookings.services import BookingConflictError

        Booking.objects.create(
            room=self.room,
            title="Occupé",
            start_datetime=combine(date(2025, 1, 20), time(9, 0)),
            end_datetime=combine(date(2025, 1, 20), time(11, 0)),
        )
        with self.assertRaises(BookingConflictError):
            create_recurrent_bookings(
                room=self.room,
                payload={"title": "Maths"},
                recurrence=self._recurrence(),
                conflict_policy="strict",
            )
        self.assertEqual(Booking.objects.count(), 1)

    def test_skip_policy_creates_the_free_dates(self):
        Booking.objects.create(
            room=self.room,
            title="Occupé",
            start_datetime=combine(date(2025, 1, 20), time(9, 0)),
            end_datetime=combine(date(2025, 1, 20), time(11, 0)),
        )
        result = create_recurrent_bookings(
            room=self.room,
            payload={"title": "Maths"},
            recurrence=self._recurrence(),
            conflict_policy="skip",
        )
        self.assertEqual(result.skipped_count, 1)
        self.assertGreater(result.created_count, 0)
        skipped_day = timezone.localtime(result.skipped[0].start).date()
        self.assertEqual(skipped_day, date(2025, 1, 20))
        self.assertFalse(
            Booking.objects.filter(
                series=result.series, start_datetime__date=date(2025, 1, 20)
            ).exists()
        )


class UsageStatsTests(TestCase):
    def setUp(self):
        self.room = Room.objects.create(name="Salle D", code="d", capacity=50)
        for day in range(3):
            start = combine(date(2025, 4, 7) + timedelta(days=day), time(9, 0))
            Booking.objects.create(
                room=self.room,
                title=f"Séance {day}",
                start_datetime=start,
                end_datetime=start + timedelta(hours=2),
            )

    def test_stats_count_hours_and_peak(self):
        from bookings.services import calculate_usage_stats

        stats = calculate_usage_stats(self.room.id, date(2025, 4, 7), date(2025, 4, 13))
        self.assertEqual(stats["bookings_count"], 3)
        self.assertAlmostEqual(stats["booked_hours"], 6.0, places=2)
        self.assertGreater(stats["occupancy_rate"], 0)
        self.assertEqual(stats["peak_hours"][0]["hour"], 9)

    def test_stats_ignore_bookings_outside_the_window(self):
        from bookings.services import calculate_usage_stats

        stats = calculate_usage_stats(self.room.id, date(2025, 5, 1), date(2025, 5, 31))
        self.assertEqual(stats["bookings_count"], 0)
        self.assertEqual(stats["booked_hours"], 0.0)
