# SchoolDoc

School management system. **Stack:** Node + Express 5 · PostgreSQL · Vue 3 + Vite.

Modules (v0.1): students, registrations, teachers, classes, courses.

## Data model

```
teachers 1───* classes (homeroom_teacher_id)
classes  *───* courses  via class_courses (+ teacher_id: who teaches it)
students 1───* registrations *───1 classes
students *───* guardians via student_guardians (+ relation, is_primary)
```

- `registrations` has `UNIQUE (student_id, academic_year)`: one class per student per year.
- Registration runs in a transaction with `SELECT … FOR UPDATE` on the class to enforce `capacity` safely under concurrency.
- Status: `pending → confirmed | cancelled` (PostgreSQL enum).

## Structure

```
backend/src
  app.js, server.js
  db/        pool.js, migrate.js, migrations/*.sql
  middleware/errors.js        # HttpError + PG error code → HTTP status
  modules/crud.js             # generic CRUD router (whitelisted fields, parameterized SQL)
  modules/<module>/*.routes.js
frontend/src
  api/http.js                 # axios + resource() factory
  composables/useCrud.js      # list/save/remove + loading/error state
  components/CrudPage.vue     # config-driven table + form
  views/                      # one view per module
  router/index.js             # lazy-loaded routes
```

## Run

```bash
createdb schooldoc
cd backend && cp .env.example .env && npm i && npm run migrate && npm run dev   # :3000
cd frontend && npm i && npm run dev                                            # :5173 (proxies /api)
```

### Sample data

```bash
cd backend
npm run populate              # fills an empty database
npm run populate -- --reset   # wipes all tables, then reseeds
```

Generates a realistic Central African secondary school (French system, 6e → Tle) for the 2026-2027 year:
~50 teachers (salaries in FCFA), 14 courses, 21 classes of 50–60 seats, ~1,000 students with
guardians (siblings share parents), and registrations (mostly confirmed). Names, cities, nationalities
and phone numbers come from Cameroon, Gabon, Congo, CAR, Chad and Equatorial Guinea. The generator
is seeded, so every run gives the same data.

## API

| Resource | Endpoints |
|---|---|
| `/api/students`, `/api/teachers`, `/api/courses`, `/api/classes` | `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id` |
| `/api/classes/:id/courses` | `GET`, `POST {course_id, teacher_id}`, `DELETE /:courseId` |
| `/api/classes/:id/students` | `GET` |
| `/api/guardians` | `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id` |
| `/api/students/:id/guardians` | `GET`, `POST {guardian_id \| new guardian fields, relation, is_primary}`, `DELETE /:guardianId` |
| `/api/registrations` | `GET /`, `POST {student_id, class_id}`, `PATCH /:id/status {status}`, `DELETE /:id` |

**Pagination** — every list endpoint accepts `?page=1&pageSize=50` (default 50, max 100) and returns
`{ data, total, page, pageSize, totalPages }` (registrations also return per-status `counts`).
Lists also take `?search=` and exact filters (e.g. `?status=active`). Without `page`, the full array is
returned, which the dropdowns use.
