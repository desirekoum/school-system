# SchoolDoc

School management system. **Stack:** Node + Express 5 · PostgreSQL · Vue 3 + Vite.

Modules (v0.1): students, registrations, teachers, classes, courses.

## Data model

```
teachers 1───* classes (homeroom_teacher_id)
classes  *───* courses  via class_courses (+ teacher_id: who teaches it)
students 1───* registrations *───1 classes
students *───* guardians via student_guardians (+ relation, is_primary)
academic_years 1───3 trimesters 1───2 exams 1───* grades (student, course, class, score /20)
classes.academic_year, registrations.academic_year ──> academic_years.name
```

- **Grading**: course average = mean of the exams of the period (trimester or year).
  General average = course averages weighted by coefficient. Rank uses `RANK()` (ties share a rank). Pass mark 10/20.
- Creating an academic year creates its 3 trimesters and 6 exams. Only one year can be current (partial unique index).
- Migration `003` backfills academic years from existing classes and registrations.
- **Finances** (amounts in whole FCFA):
  - Each class has a `tuition_fee`, which is copied onto the registration. A new class fee also applies to registrations with no payment and no plan yet.
  - A registration stays `pending` until its tuition is fully paid, then becomes `confirmed` automatically.
  - An instalment plan (2 to 6 parts, adding up to the fee) is `requested`, then `approved` or `rejected`. Only approved plans count toward overdue amounts.
  - Payments are never deleted: they are voided with a reason. Receipt numbers come from a sequence (`REC-2026-000123`).
  - The views `registration_balances` and `instalment_progress` compute paid, balance and instalment status. A running `SUM() OVER` spreads the payments over the instalments in order.

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
guardians (siblings share parents), and registrations. It also creates the academic year with a full set of grades
(6 exams × every course), and finances:
- tuition from 120,000 FCFA (6e) to 200,000 FCFA (Tle)
- about 1,000 payments (cash, mobile money, transfers, cheques)
- about 400 instalment plans (3 parts: September, January, April), some of them overdue Names, cities, nationalities
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
| `/api/academic-years` | `GET /`, `GET /current`, `GET /:id`, `POST /`, `PUT /:id`, `POST /:id/current`, `DELETE /:id` |
| `/api/academic-years/trimesters/:id`, `/exams/:id` | `PUT {start_date, end_date}`, `PUT {exam_date}` |
| `/api/classes/:id/gradebook` | `GET ?exam_id&course_id`, `PUT {exam_id, course_id, grades: [{student_id, score, comment}]}` (null score deletes) |
| `/api/classes/:id/results` | `GET ?trimester=1\|2\|3` (omit for the full year) |
| `/api/students/:id/report-card` | `GET ?academic_year=` |
| `/api/finances/accounts` | `GET` (filters: `academic_year`, `class_id`, `student_id`, `payment_status`, `plan_status`, `is_overdue`), `GET /:registrationId` |
| `/api/finances/accounts/:id/plan` | `PUT {instalments: [{due_date, amount}], reason}`, `DELETE` |
| `/api/finances/plans/:id` | `POST /approve`, `POST /reject` |
| `/api/finances/payments` | `GET ?from&to&method&academic_year&voided` (+ `sum`), `GET /:id` (receipt), `POST {registration_id, amount, method, reference, paid_at, received_by, notes}`, `POST /:id/void {reason}` |
| `/api/finances/report` | `GET ?academic_year=`: totals, per class, per method, per month, largest balances |
| `/api/registrations` `POST` | also accepts `payment: {amount, method, reference}` and `plan: {instalments}`, both saved in the same transaction |

**Pagination** — every list endpoint accepts `?page=1&pageSize=50` (default 50, max 100) and returns
`{ data, total, page, pageSize, totalPages }` (registrations also return per-status `counts`).
Lists also take `?search=` and exact filters (e.g. `?status=active`). Without `page`, the full array is
returned, which the dropdowns use.
