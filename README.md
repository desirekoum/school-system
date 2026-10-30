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
  - A registration stays `pending` until its tuition is fully paid, or until the first instalment of an **approved** plan is paid; it then becomes `confirmed` automatically (`registration_balances.confirmable`, migration `007`). Approving, changing or removing a plan, and voiding a payment, re-check the status.
  - An instalment plan (2 to 6 parts, adding up to the fee) is `requested`, then `approved` or `rejected`. Only approved plans count toward overdue amounts.
  - Payments are never deleted: they are voided with a reason. Receipt numbers come from a sequence (`REC-2026-000123`).
  - The views `registration_balances` and `instalment_progress` compute paid, balance and instalment status. A running `SUM() OVER` spreads the payments over the instalments in order.
- **Shop and expenses** (migration `005`):
  - `items` is the catalog of what the school sells. Stock is tracked unless it is left empty (services such as insurance).
  - `sales` and `sale_items` record what was sold. The price is copied at sale time, and `amount` is a generated column. Item rows are locked in id order, so stock can't go negative and two sales can't deadlock.
  - `expenses` records money spent, by category. A stock purchase (`item_id`) adds its quantity to the item's stock.
  - Sales and expenses are voided, never deleted. Voiding gives the stock back, or takes it away again for a purchase.
  - Receipt numbers: sales `VNT-2026-000001`, expense vouchers `DEP-2026-000001`.
  - The financial report adds money in (tuition + sales), money out (expenses), net cash, monthly cash flow, expenses by category and best-selling items.

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
cd backend && cp .env.example .env     # then set APP_SECRET (openssl rand -base64 48)
npm i && npm run dev-cert              # self-signed certificate for https://localhost (certs/, git-ignored)
npm run migrate
npm run create-admin -- admin you@school.cm "Your Name"   # first account: prints a temporary password
npm run dev                                               # https://localhost:3000
cd ../frontend && npm i && npm run dev                    # https://localhost:5173 (proxies /api over HTTPS)
```

Open https://localhost:5173 and sign in. In development, email and SMS codes are printed in the API console
until `SMTP_*` / `SMS_*` are set in `.env`. Users, roles and the security design are described in
[docs/ROLES.md](docs/ROLES.md).

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
- about 400 instalment plans (3 parts: September, January, April), some of them overdue
- a shop of 17 items (uniforms, books, supplies, ID card, insurance...) with about 1,900 sales and restocks
- about 45 expenses (electricity, water, internet, fuel, furniture, computers, repairs, events) Names, cities, nationalities
and phone numbers come from Cameroon, Gabon, Congo, CAR, Chad and Equatorial Guinea. The generator
is seeded, so every run gives the same data.

It also creates one demo account per role (password `SchoolDoc2026`, already changed, so no forced change):
`admin`, `principal`, `registrar` (email code), `bursar`, `cashier` (SMS code) and `teacher` (authenticator app:
the first sign-in shows a QR code). `--reset` deletes all users too: run `create-admin` again afterwards if needed.
Never keep these accounts on a real server.

## API

Every endpoint except `/api/health` and `/api/auth/*` needs a session cookie and the role permission listed in
[docs/ROLES.md](docs/ROLES.md): `401` = not signed in, `403` = signed in but not allowed.

| Resource | Endpoints |
|---|---|
| `/api/auth` | `POST /login {username, password}` → `{challenge, method, destination, setup?}`, `POST /verify {challenge, code}` → user + `sd_session` cookie, `POST /resend {challenge}`, `GET /me`, `POST /change-password {current_password, new_password}`, `POST /logout` |
| `/api/users` (admin) | `GET /` (filters `role`, `is_active`), `GET /:id` (+ recent events, open sessions), `POST /` → `{user, temporary_password}`, `PUT /:id`, `DELETE /:id`, `POST /:id/reset-password`, `/reset-mfa`, `/unlock`, `/sign-out`, `GET /roles`, `GET /events` (security log) |
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
| `/api/items` | CRUD (filters `category`, `is_active`; includes `sold`). Deleting an item with sales or purchases is refused: deactivate it instead |
| `/api/sales` | `GET ?from&to&method&academic_year&student_id&voided` (+ `sum`), `GET /:id` (receipt with lines), `POST {student_id \| buyer_name, lines: [{item_id, quantity}], method, reference, sold_at}`, `POST /:id/void {reason}` |
| `/api/expenses` | `GET ?from&to&category&method&academic_year&voided` (+ `sum`), `GET /:id`, `POST {category, description, item_id?, quantity, unit_price, supplier, spent_at, method, reference}`, `POST /:id/void {reason}` |
| `/api/import/:entity` | `GET /template` (.xlsx to fill), `POST ?dry_run=1` (body = the .xlsx file: checks every row, saves nothing), `POST` (saves all rows, or none if one row has an error). Entities: `students`, `guardians`, `teachers`, `courses`, `classes`, `class-courses`, `items`, `registrations` |
| `/api/registrations` `POST` | also accepts `payment: {amount, method, reference}` and `plan: {instalments}`, both saved in the same transaction |

**Pagination** — every list endpoint accepts `?page=1&pageSize=50` (default 50, max 100) and returns
`{ data, total, page, pageSize, totalPages }` (registrations also return per-status `counts`).
Lists also take `?search=` and exact filters (e.g. `?status=active`). Without `page`, the full array is
returned, which the dropdowns use.

**Excel import / export** — list pages export to Excel (.xlsx) or CSV. The export headers are the ones the import reads,
so a list can be exported, edited in Excel and imported back: records are matched by their natural key (matricule,
email, code, class name + year) and updated, the others are created. Empty cells leave existing values unchanged.
French headers (Nom, Prénom, Sexe, Date de naissance…) and values (Masculin, Père, CDI…) are recognised.
