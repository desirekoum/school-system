-- Academic years → 3 trimesters → 2 exams each; grades per (exam, course, student) on /20

CREATE TABLE academic_years (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(9) UNIQUE NOT NULL CHECK (name ~ '^\d{4}-\d{4}$'),   -- e.g. 2026-2027
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date > start_date)
);
-- Only one current year (partial unique index)
CREATE UNIQUE INDEX uq_one_current_year ON academic_years(is_current) WHERE is_current;

CREATE TABLE trimesters (
  id               SERIAL PRIMARY KEY,
  academic_year_id INT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  number           SMALLINT NOT NULL CHECK (number BETWEEN 1 AND 3),
  start_date       DATE,
  end_date         DATE,
  UNIQUE (academic_year_id, number)
);

CREATE TABLE exams (
  id           SERIAL PRIMARY KEY,
  trimester_id INT NOT NULL REFERENCES trimesters(id) ON DELETE CASCADE,
  number       SMALLINT NOT NULL CHECK (number IN (1, 2)),
  exam_date    DATE,
  UNIQUE (trimester_id, number)
);

CREATE TABLE grades (
  id         SERIAL PRIMARY KEY,
  exam_id    INT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  class_id   INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  course_id  INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  score      NUMERIC(4,2) NOT NULL CHECK (score BETWEEN 0 AND 20),
  comment    VARCHAR(200),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, course_id, student_id)
);
CREATE INDEX idx_grades_class_exam ON grades(class_id, exam_id);
CREATE INDEX idx_grades_student ON grades(student_id);

-- Existing years used by classes/registrations become academic_years rows (Sept → June)
INSERT INTO academic_years (name, start_date, end_date)
SELECT y, make_date(left(y, 4)::int, 9, 1), make_date(right(y, 4)::int, 6, 30)
FROM (SELECT academic_year AS y FROM classes UNION SELECT academic_year FROM registrations) t
WHERE y ~ '^\d{4}-\d{4}$'
ON CONFLICT DO NOTHING;

UPDATE academic_years SET is_current = true
WHERE id = (SELECT id FROM academic_years ORDER BY name DESC LIMIT 1);

-- 3 trimesters × 2 exams for every year created above
INSERT INTO trimesters (academic_year_id, number, start_date, end_date)
SELECT ay.id, n,
       (ay.start_date + ((n - 1) * 100) * INTERVAL '1 day')::date,
       CASE WHEN n = 3 THEN ay.end_date ELSE (ay.start_date + (n * 100 - 1) * INTERVAL '1 day')::date END
FROM academic_years ay CROSS JOIN generate_series(1, 3) n;

INSERT INTO exams (trimester_id, number) SELECT t.id, n FROM trimesters t CROSS JOIN generate_series(1, 2) n;

-- Classes and registrations now reference a real academic year (renaming a year cascades)
ALTER TABLE classes ADD CONSTRAINT fk_classes_year
  FOREIGN KEY (academic_year) REFERENCES academic_years(name) ON UPDATE CASCADE;
ALTER TABLE registrations ADD CONSTRAINT fk_registrations_year
  FOREIGN KEY (academic_year) REFERENCES academic_years(name) ON UPDATE CASCADE;
