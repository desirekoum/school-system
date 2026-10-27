# SchoolDoc

School management system. **Stack:** Node + Express 5 · PostgreSQL · Vue 3 + Vite.

Modules (v0.1): students, registrations, teachers, classes, courses.

## Data model

```
teachers 1───* classes (homeroom_teacher_id)
classes  *───* courses  via class_courses (+ teacher_id: who teaches it)
students 1───* registrations *───1 classes
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

## API

| Resource | Endpoints |
|---|---|
| `/api/students`, `/api/teachers`, `/api/courses`, `/api/classes` | `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id` |
| `/api/classes/:id/courses` | `GET`, `POST {course_id, teacher_id}`, `DELETE /:courseId` |
| `/api/classes/:id/students` | `GET` |
| `/api/registrations` | `GET /`, `POST {student_id, class_id}`, `PATCH /:id/status {status}`, `DELETE /:id` |
