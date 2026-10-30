-- Timetable: weekly slots of a class. A class row belongs to one academic year,
-- so a class's slots form its timetable for that year.
CREATE TABLE IF NOT EXISTS timetable_slots (
  id         SERIAL PRIMARY KEY,
  class_id   INT NOT NULL,
  course_id  INT NOT NULL,
  -- NULL = the teacher assigned to the course in this class (class_courses); set to override for this slot only
  teacher_id INT REFERENCES teachers(id) ON DELETE SET NULL,
  weekday    SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),   -- ISO: 1 = Monday ... 7 = Sunday
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  room       VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time),
  -- Only a course taught in the class can be scheduled; removing the course from the class removes its slots
  FOREIGN KEY (class_id, course_id) REFERENCES class_courses(class_id, course_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_slots_class_day ON timetable_slots(class_id, weekday, start_time);
CREATE INDEX IF NOT EXISTS idx_slots_teacher_day ON timetable_slots(teacher_id, weekday);

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late', 'excused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One attendance call = one slot on one date. Class, course, teacher and times are copied
-- so a later timetable change doesn't rewrite past attendance.
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id         SERIAL PRIMARY KEY,
  slot_id    INT REFERENCES timetable_slots(id) ON DELETE SET NULL,
  class_id   INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  course_id  INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id INT REFERENCES teachers(id) ON DELETE SET NULL,
  date       DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  taken_by   INT REFERENCES users(id) ON DELETE SET NULL,
  taken_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slot_id, date)
);
CREATE INDEX IF NOT EXISTS idx_att_sessions_class_date ON attendance_sessions(class_id, date);
CREATE INDEX IF NOT EXISTS idx_att_sessions_date ON attendance_sessions(date);

CREATE TABLE IF NOT EXISTS attendance_records (
  session_id   INT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id   INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status       attendance_status NOT NULL,
  minutes_late SMALLINT CHECK (minutes_late > 0),
  note         VARCHAR(200),
  PRIMARY KEY (session_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_att_records_student ON attendance_records(student_id);
