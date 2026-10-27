-- Core schema: students, teachers, classes, courses, registrations
CREATE TABLE IF NOT EXISTS students (
  id             SERIAL PRIMARY KEY,
  matricule      VARCHAR(20)  UNIQUE NOT NULL,
  first_name     VARCHAR(100) NOT NULL,
  last_name      VARCHAR(100) NOT NULL,
  birth_date     DATE,
  gender         CHAR(1) CHECK (gender IN ('M','F')),
  email          VARCHAR(150) UNIQUE,
  phone          VARCHAR(30),
  address        TEXT,
  guardian_name  VARCHAR(150),
  guardian_phone VARCHAR(30),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teachers (
  id         SERIAL PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name  VARCHAR(100) NOT NULL,
  email      VARCHAR(150) UNIQUE NOT NULL,
  phone      VARCHAR(30),
  specialty  VARCHAR(100),
  hire_date  DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS classes (
  id                  SERIAL PRIMARY KEY,
  name                VARCHAR(50) NOT NULL,
  level               VARCHAR(50) NOT NULL,
  academic_year       VARCHAR(9)  NOT NULL,          -- e.g. 2026-2027
  capacity            INT NOT NULL DEFAULT 40 CHECK (capacity > 0),
  homeroom_teacher_id INT REFERENCES teachers(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, academic_year)
);

CREATE TABLE IF NOT EXISTS courses (
  id             SERIAL PRIMARY KEY,
  code           VARCHAR(20) UNIQUE NOT NULL,
  name           VARCHAR(100) NOT NULL,
  description    TEXT,
  coefficient    NUMERIC(4,2) NOT NULL DEFAULT 1 CHECK (coefficient > 0),
  hours_per_week INT NOT NULL DEFAULT 1 CHECK (hours_per_week > 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which course is taught in which class, by which teacher (N:N join table)
CREATE TABLE IF NOT EXISTS class_courses (
  class_id   INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  course_id  INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id INT REFERENCES teachers(id) ON DELETE SET NULL,
  PRIMARY KEY (class_id, course_id)
);

DO $$ BEGIN
  CREATE TYPE registration_status AS ENUM ('pending','confirmed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A student is registered in exactly one class per academic year
CREATE TABLE IF NOT EXISTS registrations (
  id            SERIAL PRIMARY KEY,
  student_id    INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id      INT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  academic_year VARCHAR(9) NOT NULL,
  status        registration_status NOT NULL DEFAULT 'pending',
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_registrations_class ON registrations(class_id);
