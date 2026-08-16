from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from bookings.models import Booking, BookingStatus
from bookings.services import combine
from employees.models import Employee
from rooms.models import ResourceCondition, ResourceType, Room, RoomResource, RoomStatus
from users.models import Role

User = get_user_model()


class BookingApiTestCase(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin", email="admin@focus.ma", password="Focus!2025", role=Role.ADMIN
        )
        self.staff = User.objects.create_user(
            username="prof", email="prof@focus.ma", password="Focus!2025", role=Role.STAFF
        )
        self.room = Room.objects.create(
            name="Salle Al Massira", code="massira", capacity=30, status=RoomStatus.AVAILABLE
        )
        self.projector = ResourceType.objects.create(
            code="projector", name_fr="Projecteur", name_ar="عارض ضوئي"
        )
        RoomResource.objects.create(
            room=self.room, resource_type=self.projector, quantity=1,
            condition=ResourceCondition.OK,
        )
        self.client.force_authenticate(self.admin)

    def _payload(self, **overrides):
        payload = {
            "room": self.room.id,
            "title": "Cours de mathématiques",
            "purpose": "Révision",
            "expected_attendees": 25,
            "start_date": "2025-01-13",
            "start_time": "08:00",
            "end_time": "10:00",
            "recurrence_type": "none",
        }
        payload.update(overrides)
        return payload

    # -- creation ----------------------------------------------------------
    def test_create_one_off_booking(self):
        response = self.client.post("/api/bookings/", self._payload(), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["created_count"], 1)
        self.assertIsNone(response.data["series"])
        booking = Booking.objects.get()
        self.assertEqual(booking.title, "Cours de mathématiques")
        self.assertEqual(booking.created_by, self.admin)
        self.assertEqual(booking.booked_by_name, "admin")

    def test_create_weekly_series_matches_the_spec_example(self):
        response = self.client.post(
            "/api/bookings/",
            self._payload(
                recurrence_type="weekly",
                weekdays=["monday", "thursday"],
                end_date="2025-03-31",
                required_resources=[self.projector.id],
            ),
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["created_count"], 23)
        self.assertIsNotNone(response.data["series"])
        self.assertEqual(response.data["series"]["weekday_names"], ["monday", "thursday"])
        first = Booking.objects.order_by("start_datetime").first()
        self.assertEqual(timezone.localtime(first.start_datetime).date(), date(2025, 1, 13))
        self.assertEqual(list(first.required_resources.all()), [self.projector])

    def test_conflicting_booking_returns_409(self):
        self.client.post("/api/bookings/", self._payload(), format="json")
        response = self.client.post(
            "/api/bookings/", self._payload(title="Autre cours"), format="json"
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "booking_conflict")
        self.assertEqual(len(response.data["conflicts"]), 1)
        self.assertEqual(Booking.objects.count(), 1)

    def test_skip_policy_creates_free_dates_only(self):
        self.client.post(
            "/api/bookings/", self._payload(start_date="2025-01-20"), format="json"
        )
        response = self.client.post(
            "/api/bookings/",
            self._payload(
                recurrence_type="weekly",
                weekdays=[0],
                end_date="2025-02-10",
                conflict_policy="skip",
            ),
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["skipped_count"], 1)
        self.assertEqual(response.data["created_count"], 4)

    def test_booking_in_room_under_maintenance_is_rejected(self):
        self.room.status = RoomStatus.MAINTENANCE
        self.room.save()
        response = self.client.post("/api/bookings/", self._payload(), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("room", response.data)

    def test_attendees_above_capacity_are_rejected(self):
        response = self.client.post(
            "/api/bookings/", self._payload(expected_attendees=200), format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("expected_attendees", response.data)

    def test_missing_resource_in_room_is_rejected(self):
        whiteboard = ResourceType.objects.create(
            code="whiteboard", name_fr="Tableau", name_ar="سبورة"
        )
        response = self.client.post(
            "/api/bookings/",
            self._payload(required_resources=[whiteboard.id]),
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("required_resources", response.data)

    def test_booked_by_employee_fills_the_display_name(self):
        employee = Employee.objects.create(full_name="Ahmed Mohamed", role=Role.ROOM_MANAGER)
        response = self.client.post(
            "/api/bookings/", self._payload(booked_by=employee.id), format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Booking.objects.get().booked_by_name, "Ahmed Mohamed")

    # -- preview -----------------------------------------------------------
    def test_preview_returns_occurrences_without_creating(self):
        response = self.client.post(
            "/api/bookings/preview/",
            {
                "room": self.room.id,
                "recurrence_type": "weekly",
                "weekdays": ["monday", "thursday"],
                "start_date": "2025-01-13",
                "end_date": "2025-03-31",
                "start_time": "08:00",
                "end_time": "10:00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["occurrences_count"], 23)
        self.assertEqual(response.data["conflicts_count"], 0)
        self.assertEqual(Booking.objects.count(), 0)

    def test_preview_flags_conflicting_occurrences(self):
        self.client.post("/api/bookings/", self._payload(), format="json")
        response = self.client.post(
            "/api/bookings/preview/",
            {
                "room": self.room.id,
                "recurrence_type": "weekly",
                "weekdays": [0],
                "start_date": "2025-01-13",
                "end_date": "2025-02-03",
                "start_time": "08:00",
                "end_time": "10:00",
            },
            format="json",
        )
        self.assertEqual(response.data["conflicts_count"], 1)
        self.assertTrue(response.data["occurrences"][0]["has_conflict"])

    def test_check_collision_endpoint(self):
        self.client.post("/api/bookings/", self._payload(), format="json")
        start = combine(date(2025, 1, 13), time(9, 0))
        end = combine(date(2025, 1, 13), time(11, 0))
        response = self.client.get(
            "/api/bookings/check-collision/",
            {"room": self.room.id, "start": start.isoformat(), "end": end.isoformat()},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["has_conflict"])
        self.assertEqual(len(response.data["conflicts"]), 1)

    # -- update / delete ---------------------------------------------------
    def test_update_into_a_taken_slot_is_rejected(self):
        self.client.post("/api/bookings/", self._payload(), format="json")
        self.client.post(
            "/api/bookings/", self._payload(title="Deuxième", start_date="2025-01-14"), format="json"
        )
        second = Booking.objects.order_by("start_datetime").last()
        response = self.client.patch(
            f"/api/bookings/{second.id}/",
            {
                "start_datetime": combine(date(2025, 1, 13), time(8, 30)).isoformat(),
                "end_datetime": combine(date(2025, 1, 13), time(9, 30)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_delete_single_occurrence_cancels_it(self):
        self.client.post(
            "/api/bookings/",
            self._payload(recurrence_type="weekly", weekdays=[0], end_date="2025-02-10"),
            format="json",
        )
        booking = Booking.objects.order_by("start_datetime").first()
        response = self.client.delete(f"/api/bookings/{booking.id}/")
        self.assertEqual(response.status_code, 204)
        booking.refresh_from_db()
        self.assertEqual(booking.status, BookingStatus.CANCELLED)
        self.assertEqual(Booking.objects.filter(status=BookingStatus.CONFIRMED).count(), 4)

    def test_delete_with_series_scope_cancels_everything(self):
        self.client.post(
            "/api/bookings/",
            self._payload(recurrence_type="weekly", weekdays=[0], end_date="2025-02-10"),
            format="json",
        )
        booking = Booking.objects.order_by("start_datetime").first()
        response = self.client.delete(f"/api/bookings/{booking.id}/?scope=series")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(Booking.objects.filter(status=BookingStatus.CONFIRMED).count(), 0)

    def test_delete_with_future_scope_keeps_past_occurrences(self):
        self.client.post(
            "/api/bookings/",
            self._payload(recurrence_type="weekly", weekdays=[0], end_date="2025-02-10"),
            format="json",
        )
        third = Booking.objects.order_by("start_datetime")[2]
        response = self.client.delete(f"/api/bookings/{third.id}/?scope=future")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(Booking.objects.filter(status=BookingStatus.CONFIRMED).count(), 2)

    def test_purge_requires_admin(self):
        self.client.post("/api/bookings/", self._payload(), format="json")
        booking = Booking.objects.get()
        self.client.force_authenticate(self.staff)
        response = self.client.delete(f"/api/bookings/{booking.id}/?purge=true")
        self.assertEqual(response.status_code, 403)
        self.assertTrue(Booking.objects.filter(pk=booking.pk).exists())

    def test_series_patch_propagates_to_future_occurrences(self):
        future = timezone.localdate() + timedelta(days=3)
        self.client.post(
            "/api/bookings/",
            self._payload(
                recurrence_type="weekly",
                weekdays=[future.weekday()],
                start_date=future.isoformat(),
                end_date=(future + timedelta(days=21)).isoformat(),
            ),
            format="json",
        )
        series_id = Booking.objects.first().series_id
        response = self.client.patch(
            f"/api/booking-series/{series_id}/", {"title": "Nouveau titre"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(
            all(item.title == "Nouveau titre" for item in Booking.objects.all())
        )

    # -- read endpoints ----------------------------------------------------
    def test_upcoming_and_calendar_endpoints(self):
        soon = timezone.now() + timedelta(days=1)
        Booking.objects.create(
            room=self.room,
            title="Bientôt",
            start_datetime=soon,
            end_datetime=soon + timedelta(hours=2),
        )
        upcoming = self.client.get("/api/bookings/upcoming/?days=7")
        self.assertEqual(upcoming.status_code, 200)
        self.assertEqual(upcoming.data["count"], 1)

        calendar = self.client.get(
            "/api/bookings/calendar/",
            {
                "start": (timezone.now() - timedelta(days=1)).isoformat(),
                "end": (timezone.now() + timedelta(days=7)).isoformat(),
            },
        )
        self.assertEqual(calendar.status_code, 200)
        self.assertEqual(len(calendar.data), 1)

    def test_period_filter_splits_past_and_upcoming(self):
        past = timezone.now() - timedelta(days=10)
        Booking.objects.create(
            room=self.room, title="Passé", start_datetime=past, end_datetime=past + timedelta(hours=1)
        )
        future = timezone.now() + timedelta(days=10)
        Booking.objects.create(
            room=self.room, title="Futur", start_datetime=future, end_datetime=future + timedelta(hours=1)
        )
        self.assertEqual(self.client.get("/api/bookings/?period=past").data["count"], 1)
        self.assertEqual(self.client.get("/api/bookings/?period=upcoming").data["count"], 1)

    def test_authentication_is_required(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/bookings/").status_code, 401)


class RoomApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin", email="admin@focus.ma", password="Focus!2025", role=Role.ADMIN
        )
        self.staff = User.objects.create_user(
            username="staff", email="staff@focus.ma", password="Focus!2025", role=Role.STAFF
        )
        self.chair = ResourceType.objects.create(code="chair", name_fr="Chaise", name_ar="كرسي")
        self.client.force_authenticate(self.admin)

    def test_create_room_with_inline_resources(self):
        response = self.client.post(
            "/api/rooms/",
            {
                "name": "Salle Atlas",
                "code": "atlas",
                "capacity": 40,
                "location": "1er étage",
                "resources": [{"resource_type": self.chair.id, "quantity": 40}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        room = Room.objects.get(code="atlas")
        self.assertEqual(room.resources.count(), 1)
        self.assertEqual(room.resources.first().quantity, 40)

    def test_delete_is_a_soft_delete(self):
        room = Room.objects.create(name="Salle X", code="x", capacity=10)
        response = self.client.delete(f"/api/rooms/{room.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Room.objects.filter(pk=room.pk).exists())
        self.assertTrue(Room.all_objects.filter(pk=room.pk).exists())

        restored = self.client.post(f"/api/rooms/{room.id}/restore/")
        self.assertEqual(restored.status_code, 200)
        self.assertTrue(Room.objects.filter(pk=room.pk).exists())

    def test_non_admin_cannot_write_rooms(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post(
            "/api/rooms/", {"name": "Interdite", "code": "no", "capacity": 5}, format="json"
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.client.get("/api/rooms/").status_code, 200)

    def test_available_endpoint_reports_reasons(self):
        free = Room.objects.create(name="Libre", code="libre", capacity=10)
        busy = Room.objects.create(name="Occupée", code="busy", capacity=10)
        maintenance = Room.objects.create(
            name="Travaux", code="travaux", capacity=10, status=RoomStatus.MAINTENANCE
        )
        start = combine(date(2025, 7, 1), time(9, 0))
        Booking.objects.create(
            room=busy, title="Occupation", start_datetime=start, end_datetime=start + timedelta(hours=2)
        )
        response = self.client.get(
            "/api/rooms/available/",
            {"start": start.isoformat(), "end": (start + timedelta(hours=1)).isoformat()},
        )
        self.assertEqual(response.status_code, 200)
        by_id = {item["room"]["id"]: item for item in response.data}
        self.assertTrue(by_id[free.id]["is_available"])
        self.assertEqual(by_id[busy.id]["reason"], "booked")
        self.assertEqual(by_id[maintenance.id]["reason"], "maintenance")

    def test_capacity_and_resource_filters(self):
        small = Room.objects.create(name="Petite", code="petite", capacity=8)
        big = Room.objects.create(name="Grande", code="grande", capacity=80)
        RoomResource.objects.create(room=big, resource_type=self.chair, quantity=80)

        response = self.client.get("/api/rooms/?min_capacity=20")
        codes = [item["code"] for item in response.data["results"]]
        self.assertIn("grande", codes)
        self.assertNotIn("petite", codes)

        response = self.client.get("/api/rooms/?resource=chair")
        codes = [item["code"] for item in response.data["results"]]
        self.assertEqual(codes, ["grande"])
        self.assertEqual(small.capacity, 8)


class AnalyticsApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin", email="admin@focus.ma", password="Focus!2025", role=Role.ADMIN
        )
        self.room = Room.objects.create(name="Salle Stats", code="stats", capacity=20)
        self.client.force_authenticate(self.admin)

    def test_summary_endpoint(self):
        now = timezone.now()
        Booking.objects.create(
            room=self.room, title="En cours", start_datetime=now - timedelta(minutes=30),
            end_datetime=now + timedelta(hours=1),
        )
        response = self.client.get("/api/analytics/summary/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total_rooms"], 1)
        self.assertEqual(response.data["ongoing_bookings"], 1)
        self.assertEqual(response.data["available_now"], 0)

    def test_summary_cache_is_invalidated_by_a_new_booking(self):
        first = self.client.get("/api/analytics/summary/").data["bookings_today"]
        start = timezone.now() + timedelta(hours=2)
        Booking.objects.create(
            room=self.room, title="Nouveau", start_datetime=start,
            end_datetime=start + timedelta(hours=1),
        )
        second = self.client.get("/api/analytics/summary/").data["bookings_today"]
        self.assertEqual(first + 1, second)

    def test_room_usage_and_timeline(self):
        start = timezone.now() - timedelta(days=2)
        Booking.objects.create(
            room=self.room, title="Séance", start_datetime=start,
            end_datetime=start + timedelta(hours=3),
        )
        usage = self.client.get("/api/analytics/room-usage/")
        self.assertEqual(usage.status_code, 200)
        self.assertEqual(usage.data["rooms"][0]["bookings_count"], 1)
        self.assertAlmostEqual(usage.data["rooms"][0]["booked_hours"], 3.0, places=1)

        timeline = self.client.get("/api/analytics/timeline/?months=3")
        self.assertEqual(timeline.status_code, 200)
        self.assertEqual(len(timeline.data["months"]), 3)

    def test_alerts_endpoint_lists_maintenance_and_reminders(self):
        Room.objects.create(name="HS", code="hs", capacity=5, status=RoomStatus.MAINTENANCE)
        soon = timezone.now() + timedelta(hours=3)
        Booking.objects.create(
            room=self.room, title="Bientôt", start_datetime=soon,
            end_datetime=soon + timedelta(hours=1),
        )
        response = self.client.get("/api/notifications/alerts/")
        self.assertEqual(response.status_code, 200)
        categories = {item["category"] for item in response.data}
        self.assertIn("room_maintenance", categories)
        self.assertIn("booking_reminder", categories)

    def test_notifications_are_created_for_new_bookings(self):
        start = timezone.now() + timedelta(days=1)
        Booking.objects.create(
            room=self.room, title="Notifiée", start_datetime=start,
            end_datetime=start + timedelta(hours=1),
        )
        response = self.client.get("/api/notifications/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["category"], "booking_created")


class EmployeeApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin", email="admin@focus.ma", password="Focus!2025", role=Role.ADMIN
        )
        self.manager_user = User.objects.create_user(
            username="gardien", email="g@focus.ma", password="Focus!2025", role=Role.ROOM_MANAGER
        )
        self.room = Room.objects.create(name="Salle E", code="e", capacity=15)

    def test_admin_can_create_employee_with_rooms(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/employees/",
            {
                "full_name": "Fatima Zahra",
                "email": "fatima@focus.ma",
                "phone": "0612345678",
                "role": Role.ROOM_MANAGER,
                "managed_rooms": [self.room.id],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        employee = Employee.objects.get()
        self.assertEqual(list(employee.managed_rooms.all()), [self.room])

    def test_room_manager_cannot_list_employees(self):
        self.client.force_authenticate(self.manager_user)
        self.assertEqual(self.client.get("/api/employees/").status_code, 403)

    def test_room_manager_can_edit_bookings_of_their_room(self):
        employee = Employee.objects.create(
            full_name="Gardien", role=Role.ROOM_MANAGER, user=self.manager_user
        )
        employee.managed_rooms.add(self.room)
        start = timezone.now() + timedelta(days=2)
        booking = Booking.objects.create(
            room=self.room, title="À modifier", start_datetime=start,
            end_datetime=start + timedelta(hours=1), created_by=self.admin,
        )
        self.client.force_authenticate(self.manager_user)
        response = self.client.patch(
            f"/api/bookings/{booking.id}/", {"title": "Modifiée"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)

    def test_user_cannot_edit_someone_elses_booking(self):
        start = timezone.now() + timedelta(days=2)
        booking = Booking.objects.create(
            room=self.room, title="Autre", start_datetime=start,
            end_datetime=start + timedelta(hours=1), created_by=self.admin,
        )
        self.client.force_authenticate(self.manager_user)
        response = self.client.patch(
            f"/api/bookings/{booking.id}/", {"title": "Piratée"}, format="json"
        )
        self.assertEqual(response.status_code, 403)


class AuthApiTests(APITestCase):
    def test_login_returns_tokens_and_profile(self):
        User.objects.create_user(
            username="admin", email="admin@focus.ma", password="Focus!2025", role=Role.ADMIN
        )
        response = self.client.post(
            "/api/auth/login/", {"username": "admin", "password": "Focus!2025"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertEqual(response.data["user"]["role"], Role.ADMIN)

    def test_me_endpoint_exposes_managed_rooms(self):
        user = User.objects.create_user(
            username="gardien", email="g@focus.ma", password="Focus!2025", role=Role.ROOM_MANAGER
        )
        room = Room.objects.create(name="Salle F", code="f", capacity=12)
        employee = Employee.objects.create(full_name="Gardien", user=user, role=Role.ROOM_MANAGER)
        employee.managed_rooms.add(room)

        self.client.force_authenticate(user)
        response = self.client.get("/api/users/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["managed_room_ids"], [room.id])
