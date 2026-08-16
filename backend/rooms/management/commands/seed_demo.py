"""
Populate the database with a realistic demo dataset for Centre Focus - Safi.

    python manage.py seed_demo
    python manage.py seed_demo --flush   # wipe the demo data first
"""

import random
from datetime import time, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from bookings.models import Booking, BookingSeries, ConflictPolicy, RecurrenceType
from bookings.services import create_recurrent_bookings
from employees.models import Department, Employee
from notifications.models import Notification
from rooms.models import (
    ResourceCondition,
    ResourceIssue,
    ResourceType,
    Room,
    RoomResource,
    RoomStatus,
)
from users.models import Role

User = get_user_model()

RESOURCE_TYPES = [
    ("chair", "Chaises", "كراسي", "chair", True),
    ("table", "Tables", "طاولات", "table", True),
    ("whiteboard", "Tableau blanc", "سبورة بيضاء", "square-pen", True),
    ("smartboard", "Tableau interactif", "سبورة ذكية", "monitor-play", True),
    ("projector", "Projecteur", "عارض ضوئي", "projector", True),
    ("ac", "Climatisation", "مكيف الهواء", "air-vent", False),
    ("lighting", "Éclairage", "إنارة", "lightbulb", False),
    ("speakers", "Sonorisation", "مكبرات الصوت", "volume-2", False),
    ("wifi", "Wi-Fi", "واي فاي", "wifi", False),
    ("computers", "Ordinateurs", "حواسيب", "laptop", True),
]

ROOMS = [
    ("Salle Al Massira", "قاعة المسيرة", "massira", 40, "Rez-de-chaussée - Aile A", "#2563eb"),
    ("Salle Atlas", "قاعة الأطلس", "atlas", 30, "1er étage - Aile A", "#16a34a"),
    ("Salle Tarik Ibn Ziad", "قاعة طارق بن زياد", "tarik", 25, "1er étage - Aile B", "#db2777"),
    ("Salle Ibn Battouta", "قاعة ابن بطوطة", "battouta", 20, "2e étage - Aile A", "#f59e0b"),
    ("Laboratoire Informatique", "مختبر المعلوميات", "labo-info", 24, "2e étage - Aile B", "#7c3aed"),
    ("Salle de Conférence", "قاعة المحاضرات", "conference", 90, "Rez-de-chaussée - Hall", "#dc2626"),
    ("Salle Chouhada", "قاعة الشهداء", "chouhada", 35, "1er étage - Aile C", "#0891b2"),
    ("Petite Salle Réunion", "قاعة الاجتماعات الصغيرة", "reunion", 12, "Administration", "#65a30d"),
]

DEPARTMENTS = [
    ("Mathématiques", "الرياضيات", "maths"),
    ("Sciences Physiques", "العلوم الفيزيائية", "physique"),
    ("Langues", "اللغات", "langues"),
    ("Informatique", "المعلوميات", "informatique"),
    ("Administration", "الإدارة", "administration"),
]

EMPLOYEES = [
    ("Yasser Abdelaziz", "yasser@focus.ma", "0661000001", Role.ADMIN, "administration"),
    ("Ahmed Mohamed", "ahmed@focus.ma", "0661000002", Role.DEPARTMENT_MANAGER, "maths"),
    ("Fatima Zahra Alaoui", "fatima@focus.ma", "0661000003", Role.DEPARTMENT_MANAGER, "langues"),
    ("Youssef Bennani", "youssef@focus.ma", "0661000004", Role.ROOM_MANAGER, "informatique"),
    ("Khadija Idrissi", "khadija@focus.ma", "0661000005", Role.ROOM_MANAGER, "physique"),
    ("Mohamed Saidi", "saidi@focus.ma", "0661000006", Role.STAFF, "administration"),
    ("Salma Tazi", "salma@focus.ma", "0661000007", Role.STAFF, "langues"),
]

COURSES = [
    ("Cours de Mathématiques", "دروس الرياضيات", "Séance de révision - 2ème Bac"),
    ("Cours de Physique", "دروس الفيزياء", "Travaux dirigés"),
    ("Atelier Français", "ورشة الفرنسية", "Expression orale"),
    ("Atelier Anglais", "ورشة الإنجليزية", "Conversation"),
    ("Initiation Informatique", "مبادئ المعلوميات", "Bureautique et Internet"),
    ("Soutien Scolaire", "الدعم المدرسي", "Collège - toutes matières"),
    ("Réunion Pédagogique", "اجتماع تربوي", "Suivi mensuel des enseignants"),
    ("Formation Continue", "التكوين المستمر", "Formation des formateurs"),
]


class Command(BaseCommand):
    help = "Seed the database with demo data for the Focus centre."

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush",
            action="store_true",
            help="Delete the existing bookings, rooms and employees first.",
        )
        parser.add_argument(
            "--password",
            default="Focus@2025",
            help="Password given to the demo accounts (default: Focus@2025).",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        random.seed(20250115)

        if options["flush"]:
            self.stdout.write("Suppression des données existantes...")
            Notification.objects.all().delete()
            Booking.objects.all().delete()
            BookingSeries.objects.all().delete()
            ResourceIssue.objects.all().delete()
            RoomResource.objects.all().delete()
            Room.all_objects.all().delete()
            Employee.all_objects.all().delete()
            Department.objects.all().delete()
            ResourceType.objects.all().delete()
            User.objects.exclude(is_superuser=True).delete()

        password = options["password"]
        resources = self._create_resource_types()
        rooms = self._create_rooms(resources)
        departments = self._create_departments()
        employees = self._create_employees(departments, rooms, password)
        self._create_issues(rooms, employees)
        counts = self._create_bookings(rooms, employees, resources)

        self.stdout.write(self.style.SUCCESS("\nDonnées de démonstration créées:"))
        self.stdout.write(f"  - {len(resources)} types de ressources")
        self.stdout.write(f"  - {len(rooms)} salles")
        self.stdout.write(f"  - {len(departments)} départements")
        self.stdout.write(f"  - {len(employees)} employés (comptes utilisateurs inclus)")
        self.stdout.write(f"  - {counts['series']} séries récurrentes")
        self.stdout.write(f"  - {counts['bookings']} réservations")
        self.stdout.write(
            self.style.SUCCESS(f"\nConnexion: admin / {password} (rôle administrateur)")
        )

    # -- builders ----------------------------------------------------------
    def _create_resource_types(self) -> dict:
        resources = {}
        for code, name_fr, name_ar, icon, countable in RESOURCE_TYPES:
            resources[code], _ = ResourceType.objects.get_or_create(
                code=code,
                defaults={
                    "name_fr": name_fr,
                    "name_ar": name_ar,
                    "icon": icon,
                    "is_countable": countable,
                },
            )
        return resources

    def _create_rooms(self, resources: dict) -> dict:
        rooms = {}
        for name, name_ar, code, capacity, location, color in ROOMS:
            room, _ = Room.objects.get_or_create(
                code=code,
                defaults={
                    "name": name,
                    "name_ar": name_ar,
                    "capacity": capacity,
                    "location": location,
                    "color": color,
                    "description": f"Capacité {capacity} personnes - {location}.",
                },
            )
            rooms[code] = room

            RoomResource.objects.get_or_create(
                room=room, resource_type=resources["chair"], defaults={"quantity": capacity}
            )
            RoomResource.objects.get_or_create(
                room=room,
                resource_type=resources["table"],
                defaults={"quantity": max(capacity // 2, 4)},
            )
            for extra in ("lighting", "ac", "wifi"):
                RoomResource.objects.get_or_create(
                    room=room, resource_type=resources[extra], defaults={"quantity": 1}
                )
            if code in {"massira", "atlas", "conference", "labo-info", "chouhada"}:
                RoomResource.objects.get_or_create(
                    room=room, resource_type=resources["projector"], defaults={"quantity": 1}
                )
            if code in {"massira", "conference"}:
                RoomResource.objects.get_or_create(
                    room=room, resource_type=resources["smartboard"], defaults={"quantity": 1}
                )
            else:
                RoomResource.objects.get_or_create(
                    room=room, resource_type=resources["whiteboard"], defaults={"quantity": 1}
                )
            if code == "labo-info":
                RoomResource.objects.get_or_create(
                    room=room, resource_type=resources["computers"], defaults={"quantity": 24}
                )
            if code == "conference":
                RoomResource.objects.get_or_create(
                    room=room, resource_type=resources["speakers"], defaults={"quantity": 4}
                )

        # One room under maintenance and one closed, so the dashboard alerts
        # have something real to show.
        rooms["battouta"].status = RoomStatus.MAINTENANCE
        rooms["battouta"].save()
        rooms["reunion"].status = RoomStatus.CLOSED
        rooms["reunion"].save()
        return rooms

    def _create_departments(self) -> dict:
        departments = {}
        for name, name_ar, code in DEPARTMENTS:
            departments[code], _ = Department.objects.get_or_create(
                code=code, defaults={"name": name, "name_ar": name_ar}
            )
        return departments

    def _create_employees(self, departments: dict, rooms: dict, password: str) -> list:
        employees = []
        room_list = list(rooms.values())
        for index, (full_name, email, phone, role, department_code) in enumerate(EMPLOYEES):
            username = "admin" if role == Role.ADMIN and index == 0 else email.split("@")[0]
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "email": email,
                    "first_name": full_name.split()[0],
                    "last_name": " ".join(full_name.split()[1:]),
                    "role": role,
                    "phone": phone,
                    "preferred_language": "ar" if index % 2 else "fr",
                    "is_staff": role == Role.ADMIN,
                    "is_superuser": role == Role.ADMIN,
                },
            )
            if created:
                user.set_password(password)
                user.save()

            employee, _ = Employee.objects.get_or_create(
                email=email,
                defaults={
                    "user": user,
                    "full_name": full_name,
                    "phone": phone,
                    "role": role,
                    "department": departments.get(department_code),
                },
            )
            if role in {Role.ROOM_MANAGER, Role.DEPARTMENT_MANAGER}:
                employee.managed_rooms.set(random.sample(room_list, k=2))
            employees.append(employee)
        return employees

    def _create_issues(self, rooms: dict, employees: list):
        room = rooms["battouta"]
        projector = room.resources.filter(resource_type__code="lighting").first()
        ResourceIssue.objects.get_or_create(
            room=room,
            description="Deux néons grillés au fond de la salle, à remplacer.",
            defaults={"room_resource": projector, "reported_by": employees[3].user},
        )
        broken = rooms["atlas"].resources.filter(resource_type__code="projector").first()
        if broken:
            broken.condition = ResourceCondition.DAMAGED
            broken.notes = "Lampe à changer - image très sombre."
            broken.save()
            ResourceIssue.objects.get_or_create(
                room=rooms["atlas"],
                description="Le projecteur affiche une image trop sombre, lampe en fin de vie.",
                defaults={"room_resource": broken, "reported_by": employees[4].user},
            )

    def _create_bookings(self, rooms: dict, employees: list, resources: dict) -> dict:
        bookable = [room for room in rooms.values() if room.status == RoomStatus.AVAILABLE]
        today = timezone.localdate()
        term_start = today - timedelta(days=45)
        term_end = today + timedelta(days=60)

        series_count = 0
        booking_count = 0

        weekly_plans = [
            ("massira", [0, 3], time(8, 0), time(10, 0), 0),
            ("atlas", [1, 4], time(10, 0), time(12, 0), 1),
            ("tarik", [2, 5], time(14, 0), time(16, 0), 2),
            ("labo-info", [0, 2], time(16, 0), time(18, 0), 4),
            ("chouhada", [1, 3], time(9, 0), time(11, 0), 5),
            ("conference", [5], time(9, 0), time(13, 0), 7),
        ]

        for room_code, weekdays, start_time, end_time, course_index in weekly_plans:
            room = rooms[room_code]
            if room.status != RoomStatus.AVAILABLE:
                continue
            title, title_ar, purpose = COURSES[course_index]
            employee = random.choice(employees)
            required = [resources["projector"]] if room_code != "reunion" else []
            required = [item for item in required if room.resources.filter(
                resource_type=item, condition=ResourceCondition.OK
            ).exists()]

            result = create_recurrent_bookings(
                room=room,
                payload={
                    "title": f"{title} ({title_ar})",
                    "purpose": purpose,
                    "expected_attendees": random.randint(8, min(room.capacity, 30)),
                    "booked_by": employee,
                    "booked_by_name": employee.full_name,
                },
                recurrence={
                    "recurrence_type": RecurrenceType.WEEKLY,
                    "start_date": term_start,
                    "end_date": term_end,
                    "start_time": start_time,
                    "end_time": end_time,
                    "weekdays": weekdays,
                },
                conflict_policy=ConflictPolicy.SKIP,
                created_by=employees[0].user,
                required_resources=required,
            )
            series_count += 1 if result.series else 0
            booking_count += result.created_count

        # Monthly staff meeting: first Monday of the month.
        result = create_recurrent_bookings(
            room=rooms["conference"],
            payload={
                "title": "Réunion Pédagogique (اجتماع تربوي)",
                "purpose": "Suivi mensuel des enseignants",
                "expected_attendees": 25,
                "booked_by": employees[0],
                "booked_by_name": employees[0].full_name,
            },
            recurrence={
                "recurrence_type": RecurrenceType.MONTHLY,
                "start_date": term_start,
                "end_date": term_end,
                "start_time": time(17, 0),
                "end_time": time(19, 0),
                "monthly_mode": "nth_weekday",
                "weekdays": [0],
                "nth_week": 1,
            },
            conflict_policy=ConflictPolicy.SKIP,
            created_by=employees[0].user,
        )
        series_count += 1 if result.series else 0
        booking_count += result.created_count

        # A handful of one-off bookings spread around today.
        for offset in range(-20, 21, 3):
            day = today + timedelta(days=offset)
            if day.weekday() == 6:
                continue
            room = random.choice(bookable)
            title, title_ar, purpose = random.choice(COURSES)
            hour = random.choice([8, 11, 15, 18])
            employee = random.choice(employees)
            try:
                result = create_recurrent_bookings(
                    room=room,
                    payload={
                        "title": f"{title} ({title_ar})",
                        "purpose": purpose,
                        "expected_attendees": random.randint(5, min(room.capacity, 25)),
                        "booked_by": employee,
                        "booked_by_name": employee.full_name,
                    },
                    recurrence={
                        "recurrence_type": RecurrenceType.NONE,
                        "start_date": day,
                        "end_date": day,
                        "start_time": time(hour, 0),
                        "end_time": time(hour + 2, 0),
                    },
                    conflict_policy=ConflictPolicy.SKIP,
                    created_by=employees[0].user,
                )
                booking_count += result.created_count
            except Exception:
                # The slot was taken by a recurring course - simply skip it.
                continue

        return {"series": series_count, "bookings": booking_count}
