-- Extra student/teacher fields + guardians moved to their own table

DO $$ BEGIN
  CREATE TYPE student_status AS ENUM ('active','graduated','transferred','expelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE teacher_status AS ENUM ('active','on_leave','left');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE contract_type AS ENUM ('permanent','part_time','temporary');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE students
  ADD COLUMN birth_place             VARCHAR(100),
  ADD COLUMN nationality             VARCHAR(60),
  ADD COLUMN photo_url               TEXT,
  ADD COLUMN blood_group             VARCHAR(3) CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  ADD COLUMN allergies               TEXT,
  ADD COLUMN medical_notes           TEXT,
  ADD COLUMN previous_school         VARCHAR(150),
  ADD COLUMN admission_date          DATE DEFAULT CURRENT_DATE,
  ADD COLUMN status                  student_status NOT NULL DEFAULT 'active',
  ADD COLUMN emergency_contact_name  VARCHAR(150),
  ADD COLUMN emergency_contact_phone VARCHAR(30);

ALTER TABLE teachers
  ADD COLUMN employee_number VARCHAR(20) UNIQUE,
  ADD COLUMN birth_date      DATE,
  ADD COLUMN gender          CHAR(1) CHECK (gender IN ('M','F')),
  ADD COLUMN address         TEXT,
  ADD COLUMN photo_url       TEXT,
  ADD COLUMN qualifications  TEXT,                -- diplomas, certifications
  ADD COLUMN contract_type   contract_type,
  ADD COLUMN salary          NUMERIC(12,2) CHECK (salary >= 0),
  ADD COLUMN hourly_rate     NUMERIC(10,2) CHECK (hourly_rate >= 0),
  ADD COLUMN status          teacher_status NOT NULL DEFAULT 'active',
  ADD COLUMN bank_account    VARCHAR(50);

-- Normalized guardians: one guardian can be linked to several students (siblings)
CREATE TABLE guardians (
  id         SERIAL PRIMARY KEY,
  first_name VARCHAR(100),
  last_name  VARCHAR(100) NOT NULL,
  phone      VARCHAR(30),
  email      VARCHAR(150),
  profession VARCHAR(100),
  address    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE student_guardians (
  student_id  INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  guardian_id INT NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
  relation    VARCHAR(30) NOT NULL DEFAULT 'guardian',  -- father, mother, guardian, other
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (student_id, guardian_id)
);

-- At most one primary guardian per student (partial unique index)
CREATE UNIQUE INDEX uq_student_primary_guardian ON student_guardians(student_id) WHERE is_primary;

-- Move existing guardian_name/guardian_phone data, then drop the old columns
DO $$
DECLARE s RECORD; gid INT;
BEGIN
  FOR s IN SELECT id, guardian_name, guardian_phone FROM students WHERE guardian_name IS NOT NULL LOOP
    INSERT INTO guardians (last_name, phone) VALUES (s.guardian_name, s.guardian_phone) RETURNING id INTO gid;
    INSERT INTO student_guardians (student_id, guardian_id, is_primary) VALUES (s.id, gid, true);
  END LOOP;
END $$;

ALTER TABLE students DROP COLUMN guardian_name, DROP COLUMN guardian_phone;
