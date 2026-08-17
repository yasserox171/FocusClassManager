# FAAS — Gestion des Salles et des Ressources / نظام تدبير القاعات والموارد

Système complet de réservation de salles pour le **Centre Focus – Safi**.
نظام متكامل لتدبير وحجز القاعات والموارد لمركز فوكس بمدينة آسفي.

Django + DRF + PostgreSQL côté serveur, React + TypeScript côté client,
interface bilingue **arabe (RTL)** et **français (LTR)**.

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Démarrage rapide](#démarrage-rapide)
- [Installation manuelle](#installation-manuelle)
- [Données de démonstration](#données-de-démonstration)
- [API](#api)
- [Récurrences et détection des conflits](#récurrences-et-détection-des-conflits)
- [Rôles et permissions](#rôles-et-permissions)
- [Tests](#tests)
- [Configuration](#configuration)

---

## Fonctionnalités

### Salles et ressources
- CRUD complet avec **suppression douce** (l'historique des réservations est préservé).
- Inventaire par salle : chaises, tables, tableaux (blancs ou interactifs), projecteurs,
  climatisation, éclairage, sonorisation, ordinateurs, Wi-Fi… avec quantité et état
  (fonctionnel / en panne / manquant).
- États de salle : disponible, en maintenance, fermée.
- Signalement d'incidents matériels par les responsables de salle, avec résolution.
- Recherche et filtres : nom, localisation, capacité minimale/maximale, ressource requise.
- Couleur par salle, reprise dans le calendrier.

### Réservations
- **Ponctuelles** et **récurrentes** créées par le même endpoint.
- Récurrences **quotidienne, hebdomadaire, mensuelle, annuelle**, avec intervalle
  (« toutes les 2 semaines »), jours de la semaine (lundi + jeudi), et deux modes mensuels :
  même quantième, ou n-ième jour de la semaine (« le 1er lundi du mois », `-1` = le dernier).
- **Détection des conflits** sur chaque occurrence, y compris entre les occurrences
  d'une même série, avec deux politiques : tout rejeter (`strict`) ou créer les dates
  libres et signaler les autres (`skip`).
- **Aperçu avant création** (`/api/bookings/preview/`) : la liste des séances générées et
  des conflits, sans rien écrire en base.
- Suppression d'une séance, des séances suivantes, ou de la série entière.
- Annulation par défaut (statut `cancelled`, l'historique reste consultable) ;
  suppression définitive réservée aux administrateurs.
- Vue **calendrier** (mois / semaine / jour / agenda) et vue **liste** filtrable et paginée.
- Créneaux nocturnes gérés : `22:00 → 01:00` se termine le lendemain.

### Tableau de bord et statistiques
- Compteurs : salles totales, disponibles maintenant, occupées, en maintenance,
  réservations du jour et des 7 prochains jours, incidents ouverts.
- Calendrier interactif, liste des réservations à venir, alertes en direct.
- Taux d'occupation par salle, réservations dans le temps, heures de pointe,
  répartition par jour de la semaine, ressources les plus demandées.
- Résultats **mis en cache** avec invalidation automatique à chaque écriture.

### Notifications
- Notifications persistées (création / annulation de réservation, incident matériel).
- Alertes calculées en direct : salles indisponibles, incidents ouverts, réservations
  imminentes, et détection de chevauchements anormaux.

### Bilinguisme
- Toute l'interface en JSON de traduction (`src/i18n/ar.json`, `src/i18n/fr.json`).
- Bascule RTL/LTR automatique (`dir`, `lang`, police arabe Cairo).
- Les horaires sont toujours affichés à **l'heure du centre**, quel que soit le fuseau
  du navigateur.

---

## Architecture

```
FocusClassManager/
├── backend/                    Django 5 + DRF
│   ├── faas/                   settings, urls, cache versionné, modèles de base
│   ├── users/                  utilisateur personnalisé, JWT, permissions par rôle
│   ├── rooms/                  salles, ressources, incidents
│   ├── employees/              employés, départements, salles assignées
│   ├── bookings/               réservations, séries, services (récurrence + conflits)
│   ├── analytics/              endpoints statistiques (avec cache)
│   └── notifications/          notifications stockées, alertes en direct, signaux
├── frontend/                   React 18 + TypeScript + Vite
│   └── src/
│       ├── components/         Layout, BookingForm, BookingCalendar, DataTable, charts…
│       ├── pages/              Dashboard, Bookings, Rooms, Employees, Analytics, Login
│       ├── services/           client Axios (auth, salles, réservations, stats)
│       ├── context/            authentification, notifications toast
│       ├── i18n/               ar.json, fr.json, configuration RTL
│       └── utils/              formatage des dates, fuseau du centre
└── docker-compose.yml          PostgreSQL + Redis + backend + frontend (nginx)
```

**Stack** : Django 5.0, Django REST Framework, SimpleJWT, drf-spectacular (Swagger),
django-filter, PostgreSQL 16, Redis · React 18, TypeScript 5, Vite 5, Tailwind CSS 3,
react-big-calendar, Recharts, TanStack Table, React Hook Form, react-i18next.

---

## Démarrage rapide

Avec Docker, tout est lancé en une commande :

```bash
cp .env.example .env          # ajustez au moins DJANGO_SECRET_KEY et POSTGRES_PASSWORD
docker compose up --build
```

- Interface : http://localhost:8080
- API : http://localhost:8000/api/
- Documentation Swagger : http://localhost:8000/api/docs/

Puis créez un compte et, si vous le souhaitez, les données de démonstration :

```bash
docker compose exec backend python manage.py createsuperuser
docker compose exec backend python manage.py seed_demo
```

---

## Installation manuelle

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# PostgreSQL (voir .env.example), ou SQLite pour un essai rapide :
export USE_SQLITE=1

python manage.py migrate
python manage.py seed_demo          # données de démonstration (facultatif)
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
npm run dev                          # http://localhost:5173
```

Le serveur de développement Vite relaie `/api` vers `http://localhost:8000`
(`VITE_PROXY_TARGET` pour pointer ailleurs).

---

## Données de démonstration

`python manage.py seed_demo` crée un jeu de données réaliste :

- 10 types de ressources, 8 salles (dont une en maintenance et une fermée),
- 5 départements et 7 employés avec leurs comptes utilisateurs,
- 7 séries récurrentes (cours hebdomadaires, réunion mensuelle le 1er lundi)
  et des réservations ponctuelles réparties autour de la date du jour,
- des incidents matériels ouverts pour alimenter les alertes.

`seed_demo` crée aussi les comptes de démonstration (`admin` / `Focus@2025` par défaut,
`--password` pour en choisir un autre, `--flush` pour repartir de zéro).

> **Déploiement réel :** la consultation étant publique, un seul compte administrateur
> est nécessaire. Créez-le avec `createsuperuser` et n'exécutez pas `seed_demo`, ou
> supprimez ensuite les comptes de démonstration — les salles, réservations et employés
> sont conservés, les clés étrangères vers un compte supprimé passent à `NULL`.

---

## API

Documentation interactive : `/api/docs/` (Swagger) et `/api/redoc/`.
Schéma OpenAPI brut : `/api/schema/`.

### Authentification

| Méthode | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/auth/login/` | Retourne `access`, `refresh` et le profil |
| POST | `/api/auth/refresh/` | Renouvelle le jeton d'accès |
| GET | `/api/users/me/` | Profil courant et salles gérées |

### Principaux endpoints

| Méthode | Endpoint | Description |
| --- | --- | --- |
| GET/POST | `/api/rooms/` | Salles (filtres : `status`, `min_capacity`, `resource`…) |
| GET | `/api/rooms/available/?start=&end=` | Salles libres sur un créneau, avec le motif d'indisponibilité |
| POST | `/api/rooms/{id}/restore/` | Restaure une salle supprimée |
| GET/POST | `/api/resource-issues/` | Incidents matériels |
| GET/POST | `/api/bookings/` | Réservations ponctuelles **et** séries récurrentes |
| POST | `/api/bookings/preview/` | Aperçu d'une récurrence sans création |
| GET | `/api/bookings/check-collision/` | Vérifie un créneau unique |
| GET | `/api/bookings/calendar/?start=&end=` | Réservations d'une fenêtre (calendrier) |
| GET | `/api/bookings/upcoming/?days=7` | Prochaines réservations |
| DELETE | `/api/bookings/{id}/?scope=series` | Annule l'occurrence, les suivantes ou la série |
| GET/PATCH | `/api/booking-series/{id}/` | Série récurrente (modification propagée au futur) |
| GET/POST | `/api/employees/` | Employés et salles assignées |
| GET | `/api/analytics/summary/` | Compteurs du tableau de bord |
| GET | `/api/analytics/room-usage/` | Taux d'occupation par salle |
| GET | `/api/analytics/peak-hours/` | Heures de pointe |
| GET | `/api/analytics/timeline/?months=12` | Réservations mois par mois |
| GET | `/api/analytics/resources/` | Ressources les plus demandées |
| GET | `/api/notifications/alerts/` | Alertes en direct |

### Exemple — réservation récurrente

```http
POST /api/bookings/
Authorization: Bearer <access>

{
  "room": 1,
  "title": "Cours de Mathématiques",
  "purpose": "Révision 2ème Bac",
  "expected_attendees": 25,
  "booked_by": 2,
  "required_resources": [5, 3],
  "recurrence_type": "weekly",
  "weekdays": ["monday", "thursday"],
  "start_date": "2025-01-13",
  "end_date": "2025-03-31",
  "start_time": "08:00",
  "end_time": "10:00",
  "conflict_policy": "strict"
}
```

Réponse `201` :

```json
{
  "series": { "id": 4, "recurrence_type": "weekly", "weekday_names": ["monday", "thursday"] },
  "created_count": 23,
  "skipped_count": 0,
  "created": [ { "id": 51, "start_datetime": "2025-01-13T08:00:00+01:00" } ],
  "skipped": []
}
```

En cas de conflit avec `conflict_policy: "strict"`, l'API répond `409` et détaille
chaque créneau en cause :

```json
{
  "detail": "Conflit de réservation: la salle est déjà occupée.",
  "code": "booking_conflict",
  "conflicts": [
    {
      "start": "2025-01-20T08:00:00+01:00",
      "end": "2025-01-20T10:00:00+01:00",
      "conflicts": [{ "id": 12, "title": "Atelier Français", "room": "Salle Atlas" }]
    }
  ]
}
```

`"conflict_policy": "skip"` crée au contraire les dates libres et renvoie les autres
dans `skipped`.

---

## Récurrences et détection des conflits

Toute la logique vit dans `backend/bookings/services.py`, testable sans HTTP :

| Fonction | Rôle |
| --- | --- |
| `expand_recurrence(...)` | Développe une règle en liste de créneaux `(début, fin)` |
| `check_collision(room_id, start, end, exclude_booking_id=None)` | `True` si le créneau est pris |
| `find_conflicts(room_id, windows)` | Conflits avec la base **et** entre les créneaux générés |
| `create_recurrent_bookings(...)` | Crée la série et ses occurrences, en transaction |
| `calculate_usage_stats(room_id, start, end)` | Heures réservées, taux d'occupation, heures de pointe |

Règles appliquées :

- Le chevauchement est calculé sur un **intervalle semi-ouvert** : une réservation
  `11:00–12:00` juste après `09:00–11:00` est acceptée.
- Les réservations **annulées** libèrent leur créneau.
- La création verrouille les lignes de la salle (`select_for_update`) : deux requêtes
  simultanées ne peuvent pas passer le contrôle en même temps.
- Le nombre d'occurrences d'une série est plafonné (`MAX_RECURRENCE_OCCURRENCES`).
- Sont refusés : les salles en maintenance ou fermées, un nombre de participants
  supérieur à la capacité, et une ressource absente ou en panne dans la salle.

---

## Rôles et permissions

Les données du centre sont **publiques en lecture seule**. N'importe quel visiteur
consulte les salles, les réservations, l'annuaire et les statistiques **sans compte** ;
seul un **administrateur** peut créer, modifier ou supprimer quoi que ce soit.

| | Visiteur (sans compte) | Administrateur |
| --- | --- | --- |
| Salles, ressources, incidents | Lecture | Tout |
| Réservations et séries | Lecture | Tout, suppression définitive |
| Employés et départements | Lecture | Tout |
| Statistiques et alertes | Lecture | Tout |
| Comptes utilisateurs (`/api/users/`) | — | Tout |

Une seule classe de permission gouverne l'ensemble : `users.permissions.PublicReadAdminWrite`
(lecture pour tous, écriture réservée à `user.is_admin`). Les comptes utilisateurs
restent privés et ne sont jamais exposés aux visiteurs.

---

## Tests

```bash
cd backend
USE_SQLITE=1 python manage.py test        # 60 tests
```

Couverture : développement des récurrences (quotidienne, hebdomadaire, mensuelle par
quantième et par n-ième jour, annuelle, intervalles, créneaux nocturnes, plafond),
détection des conflits (chevauchements exacts, partiels, englobants, dos-à-dos,
annulations), politiques `strict` / `skip`, permissions par rôle, endpoints REST
(création, aperçu, calendrier, filtres, suppression par portée) et statistiques.

Frontend :

```bash
cd frontend
npm run typecheck
npm run build
```

---

## Configuration

Toutes les variables sont documentées dans [`.env.example`](.env.example).

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | — | **À changer en production** |
| `DJANGO_TIME_ZONE` | `Africa/Casablanca` | Fuseau de référence du centre |
| `USE_SQLITE` | `0` | `1` pour ignorer PostgreSQL (tests, démo) |
| `REDIS_URL` | vide | Cache des statistiques ; sinon cache mémoire |
| `BUSINESS_HOURS_START` / `_END` | `8` / `20` | Base de calcul du taux d'occupation |
| `BUSINESS_DAYS_PER_WEEK` | `6` | Jours ouvrables par semaine |
| `MAX_RECURRENCE_OCCURRENCES` | `400` | Plafond d'une série |
| `ANALYTICS_CACHE_TTL` | `300` | Durée de vie du cache statistique (s) |
| `VITE_TIMEZONE` | `Africa/Casablanca` | Fuseau d'affichage côté client |

---

## ملخص بالعربية

نظام **FAAS** يدبّر القاعات والموارد لمركز فوكس بآسفي:

- **القاعات**: إضافة وتعديل وحذف (حذف ناعم مع الاحتفاظ بالتاريخ)، مع جرد الموارد
  (كراسي، طاولات، سبورات عادية وذكية، عارضات ضوئية، مكيفات، إنارة، حواسيب) وحالتها.
- **الحجوزات**: عادية ودورية (يومي، أسبوعي، شهري، سنوي) مع تحديد أيام الأسبوع
  والفاصل الزمني، وكشف تلقائي للتعارضات قبل الحفظ، وإمكانية حذف حصة واحدة أو
  الحصص اللاحقة أو السلسلة كاملة.
- **الموظفون**: الأدوار والصلاحيات والقاعات المسؤول عنها.
- **لوحة القيادة**: تقويم تفاعلي، الحجوزات القادمة، التنبيهات، ونسب الاستخدام.
- **الإحصائيات**: نسبة استخدام كل قاعة، أوقات الذروة، الحجوزات عبر الزمن،
  والموارد الأكثر طلباً.
- **الواجهة** ثنائية اللغة عربية/فرنسية مع دعم كامل لاتجاه الكتابة من اليمين إلى اليسار.

**الصلاحيات**: الاطلاع على البيانات متاح للجميع بدون حساب (القاعات، الحجوزات،
الموظفون، الإحصائيات)، أما الإضافة والتعديل والحذف فمحصورة في **المدير** وحده.

للتشغيل السريع: `docker compose up --build` ثم `python manage.py seed_demo`
لإنشاء بيانات تجريبية، والدخول بـ `admin` / `Focus@2025`.
