-- SchoolDoc schema for MySQL 8.0.23+ (same tables, rules and views as the PostgreSQL migrations 001-008).
-- PostgreSQL features and their MySQL equivalents:
--   ENUM types            → inline ENUM columns
--   partial unique index  → unique index on an invisible generated column (NULL when the row doesn't count)
--   sequences in DEFAULT  → receipt_counters table + BEFORE INSERT triggers (REC-, VNT-, DEP- numbers)
--   TIMESTAMPTZ           → DATETIME(3) in UTC (the connection runs with time_zone = '+00:00')

CREATE TABLE academic_years (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(9) NOT NULL UNIQUE,
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  is_current   BOOLEAN NOT NULL DEFAULT false,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  current_flag TINYINT GENERATED ALWAYS AS (IF(is_current, 1, NULL)) STORED INVISIBLE,
  UNIQUE KEY uq_one_current_year (current_flag),
  CONSTRAINT academic_years_check CHECK (end_date > start_date),
  CONSTRAINT academic_years_name_check CHECK (REGEXP_LIKE(name, '^[0-9]{4}-[0-9]{4}$'))
);

CREATE TABLE trimesters (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  academic_year_id INT NOT NULL,
  number           SMALLINT NOT NULL,
  start_date       DATE,
  end_date         DATE,
  UNIQUE KEY trimesters_academic_year_id_number_key (academic_year_id, number),
  CONSTRAINT trimesters_number_check CHECK (number BETWEEN 1 AND 3),
  CONSTRAINT trimesters_academic_year_id_fkey FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE
);

CREATE TABLE exams (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  trimester_id INT NOT NULL,
  number       SMALLINT NOT NULL,
  exam_date    DATE,
  UNIQUE KEY exams_trimester_id_number_key (trimester_id, number),
  CONSTRAINT exams_number_check CHECK (number IN (1, 2)),
  CONSTRAINT exams_trimester_id_fkey FOREIGN KEY (trimester_id) REFERENCES trimesters(id) ON DELETE CASCADE
);

CREATE TABLE students (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  matricule               VARCHAR(20) NOT NULL UNIQUE,
  first_name              VARCHAR(100) NOT NULL,
  last_name               VARCHAR(100) NOT NULL,
  birth_date              DATE,
  gender                  CHAR(1),
  email                   VARCHAR(150) UNIQUE,
  phone                   VARCHAR(30),
  address                 TEXT,
  created_at              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  birth_place             VARCHAR(100),
  nationality             VARCHAR(60),
  photo_url               TEXT,
  blood_group             VARCHAR(3),
  allergies               TEXT,
  medical_notes           TEXT,
  previous_school         VARCHAR(150),
  admission_date          DATE DEFAULT (CURRENT_DATE),
  status                  ENUM('active','graduated','transferred','expelled') NOT NULL DEFAULT 'active',
  emergency_contact_name  VARCHAR(150),
  emergency_contact_phone VARCHAR(30),
  CONSTRAINT students_gender_check CHECK (gender IN ('M','F')),
  CONSTRAINT students_blood_group_check CHECK (blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-'))
);

CREATE TABLE teachers (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  email           VARCHAR(150) NOT NULL UNIQUE,
  phone           VARCHAR(30),
  specialty       VARCHAR(100),
  hire_date       DATE,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  employee_number VARCHAR(20) UNIQUE,
  birth_date      DATE,
  gender          CHAR(1),
  address         TEXT,
  photo_url       TEXT,
  qualifications  TEXT,
  contract_type   ENUM('permanent','part_time','temporary'),
  salary          DECIMAL(12,2),
  hourly_rate     DECIMAL(10,2),
  status          ENUM('active','on_leave','left') NOT NULL DEFAULT 'active',
  bank_account    VARCHAR(50),
  CONSTRAINT teachers_gender_check CHECK (gender IN ('M','F')),
  CONSTRAINT teachers_salary_check CHECK (salary >= 0),
  CONSTRAINT teachers_hourly_rate_check CHECK (hourly_rate >= 0)
);

CREATE TABLE guardians (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100),
  last_name  VARCHAR(100) NOT NULL,
  phone      VARCHAR(30),
  email      VARCHAR(150),
  profession VARCHAR(100),
  address    TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE student_guardians (
  student_id      INT NOT NULL,
  guardian_id     INT NOT NULL,
  relation        VARCHAR(30) NOT NULL DEFAULT 'guardian',
  is_primary      BOOLEAN NOT NULL DEFAULT false,
  -- At most one primary guardian per student
  primary_student INT GENERATED ALWAYS AS (IF(is_primary, student_id, NULL)) VIRTUAL INVISIBLE,
  PRIMARY KEY (student_id, guardian_id),
  UNIQUE KEY uq_student_primary_guardian (primary_student),
  CONSTRAINT student_guardians_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT student_guardians_guardian_id_fkey FOREIGN KEY (guardian_id) REFERENCES guardians(id) ON DELETE CASCADE
);

CREATE TABLE classes (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  name                VARCHAR(50) NOT NULL,
  level               VARCHAR(50) NOT NULL,
  academic_year       VARCHAR(9) NOT NULL,
  capacity            INT NOT NULL DEFAULT 40,
  homeroom_teacher_id INT,
  created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  tuition_fee         INT NOT NULL DEFAULT 0,
  UNIQUE KEY classes_name_academic_year_key (name, academic_year),
  CONSTRAINT classes_capacity_check CHECK (capacity > 0),
  CONSTRAINT classes_tuition_fee_check CHECK (tuition_fee >= 0),
  CONSTRAINT classes_homeroom_teacher_id_fkey FOREIGN KEY (homeroom_teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
  CONSTRAINT fk_classes_year FOREIGN KEY (academic_year) REFERENCES academic_years(name) ON UPDATE CASCADE
);

CREATE TABLE courses (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  code           VARCHAR(20) NOT NULL UNIQUE,
  name           VARCHAR(100) NOT NULL,
  description    TEXT,
  coefficient    DECIMAL(4,2) NOT NULL DEFAULT 1,
  hours_per_week INT NOT NULL DEFAULT 1,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT courses_coefficient_check CHECK (coefficient > 0),
  CONSTRAINT courses_hours_per_week_check CHECK (hours_per_week > 0)
);

CREATE TABLE class_courses (
  class_id   INT NOT NULL,
  course_id  INT NOT NULL,
  teacher_id INT,
  PRIMARY KEY (class_id, course_id),
  CONSTRAINT class_courses_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT class_courses_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT class_courses_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE TABLE registrations (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  student_id    INT NOT NULL,
  class_id      INT NOT NULL,
  academic_year VARCHAR(9) NOT NULL,
  status        ENUM('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',
  registered_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  tuition_fee   INT NOT NULL DEFAULT 0,
  UNIQUE KEY registrations_student_id_academic_year_key (student_id, academic_year),
  KEY idx_registrations_class (class_id),
  CONSTRAINT registrations_tuition_fee_check CHECK (tuition_fee >= 0),
  CONSTRAINT registrations_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT registrations_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_registrations_year FOREIGN KEY (academic_year) REFERENCES academic_years(name) ON UPDATE CASCADE
);

CREATE TABLE grades (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  exam_id    INT NOT NULL,
  class_id   INT NOT NULL,
  course_id  INT NOT NULL,
  student_id INT NOT NULL,
  score      DECIMAL(4,2) NOT NULL,
  comment    VARCHAR(200),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY grades_exam_id_course_id_student_id_key (exam_id, course_id, student_id),
  KEY idx_grades_class_exam (class_id, exam_id),
  KEY idx_grades_student (student_id),
  CONSTRAINT grades_score_check CHECK (score BETWEEN 0 AND 20),
  CONSTRAINT grades_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  CONSTRAINT grades_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT grades_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT grades_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- ---------- Finances ----------

CREATE TABLE receipt_counters (
  name  VARCHAR(20) PRIMARY KEY,
  value INT NOT NULL DEFAULT 0
);
INSERT INTO receipt_counters (name, value) VALUES ('receipt', 0), ('sale', 0), ('expense', 0);

CREATE TABLE instalment_plans (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  registration_id INT NOT NULL UNIQUE,
  status          ENUM('requested','approved','rejected') NOT NULL DEFAULT 'requested',
  reason          TEXT,
  requested_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  decided_at      DATETIME(3),
  CONSTRAINT instalment_plans_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE
);

CREATE TABLE instalments (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  plan_id  INT NOT NULL,
  number   SMALLINT NOT NULL,
  due_date DATE NOT NULL,
  amount   INT NOT NULL,
  UNIQUE KEY instalments_plan_id_number_key (plan_id, number),
  CONSTRAINT instalments_amount_check CHECK (amount > 0),
  CONSTRAINT instalments_number_check CHECK (number BETWEEN 1 AND 12),
  CONSTRAINT instalments_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES instalment_plans(id) ON DELETE CASCADE
);

CREATE TABLE payments (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  registration_id INT NOT NULL,
  receipt_number  VARCHAR(20) NOT NULL DEFAULT '' ,
  amount          INT NOT NULL,
  method          ENUM('cash','mobile_money','bank_transfer','cheque') NOT NULL DEFAULT 'cash',
  reference       TEXT,
  paid_at         DATE NOT NULL DEFAULT (CURRENT_DATE),
  received_by     TEXT,
  notes           TEXT,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  voided_at       DATETIME(3),
  void_reason     TEXT,
  UNIQUE KEY payments_receipt_number_key (receipt_number),
  KEY idx_payments_paid_at (paid_at),
  KEY idx_payments_registration (registration_id),
  CONSTRAINT payments_amount_check CHECK (amount > 0),
  CONSTRAINT payments_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE RESTRICT
);

CREATE TABLE items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(40) NOT NULL UNIQUE,
  name        VARCHAR(200) NOT NULL,
  category    VARCHAR(20) NOT NULL DEFAULT 'other',
  price       INT NOT NULL,
  stock       INT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT items_category_check CHECK (category IN ('uniform','books','supplies','documents','services','other')),
  CONSTRAINT items_price_check CHECK (price >= 0),
  CONSTRAINT items_stock_check CHECK (stock >= 0)
);

CREATE TABLE sales (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  receipt_number VARCHAR(20) NOT NULL DEFAULT '',
  student_id     INT,
  buyer_name     VARCHAR(200),
  academic_year  VARCHAR(9) NOT NULL,
  sold_at        DATE NOT NULL DEFAULT (CURRENT_DATE),
  method         ENUM('cash','mobile_money','bank_transfer','cheque') NOT NULL DEFAULT 'cash',
  reference      TEXT,
  received_by    TEXT,
  notes          TEXT,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  voided_at      DATETIME(3),
  void_reason    TEXT,
  UNIQUE KEY sales_receipt_number_key (receipt_number),
  KEY idx_sales_sold_at (sold_at),
  KEY idx_sales_student (student_id),
  CONSTRAINT sales_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
  CONSTRAINT sales_academic_year_fkey FOREIGN KEY (academic_year) REFERENCES academic_years(name) ON UPDATE CASCADE
);

CREATE TABLE sale_items (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  sale_id    INT NOT NULL,
  item_id    INT NOT NULL,
  quantity   INT NOT NULL,
  unit_price INT NOT NULL,
  amount     INT GENERATED ALWAYS AS (quantity * unit_price) STORED,
  KEY idx_sale_items_item (item_id),
  KEY idx_sale_items_sale (sale_id),
  CONSTRAINT sale_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT sale_items_unit_price_check CHECK (unit_price >= 0),
  CONSTRAINT sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT sale_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT
);

CREATE TABLE expenses (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  voucher_number VARCHAR(20) NOT NULL DEFAULT '',
  academic_year  VARCHAR(9) NOT NULL,
  category       VARCHAR(20) NOT NULL DEFAULT 'other',
  description    TEXT NOT NULL,
  supplier       VARCHAR(200),
  item_id        INT,
  quantity       INT NOT NULL DEFAULT 1,
  unit_price     INT NOT NULL,
  amount         INT GENERATED ALWAYS AS (quantity * unit_price) STORED,
  spent_at       DATE NOT NULL DEFAULT (CURRENT_DATE),
  method         ENUM('cash','mobile_money','bank_transfer','cheque') NOT NULL DEFAULT 'cash',
  reference      TEXT,
  approved_by    TEXT,
  notes          TEXT,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  voided_at      DATETIME(3),
  void_reason    TEXT,
  UNIQUE KEY expenses_voucher_number_key (voucher_number),
  KEY idx_expenses_spent_at (spent_at),
  KEY idx_expenses_year (academic_year),
  CONSTRAINT expenses_category_check CHECK (category IN ('stock','supplies','furniture','equipment','maintenance','utilities','transport','events','other')),
  CONSTRAINT expenses_quantity_check CHECK (quantity > 0),
  CONSTRAINT expenses_unit_price_check CHECK (unit_price > 0),
  CONSTRAINT expenses_item_id_fkey FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT,
  CONSTRAINT expenses_academic_year_fkey FOREIGN KEY (academic_year) REFERENCES academic_years(name) ON UPDATE CASCADE
);

-- Receipt numbers: REC-2026-000123, VNT-…, DEP-… (the UPDATE locks the counter row until the transaction ends)
CREATE TRIGGER payments_receipt_number BEFORE INSERT ON payments FOR EACH ROW
BEGIN
  IF NEW.receipt_number = '' THEN
    UPDATE receipt_counters SET value = value + 1 WHERE name = 'receipt';
    SET NEW.receipt_number = CONCAT('REC-', YEAR(NOW()), '-', LPAD((SELECT value FROM receipt_counters WHERE name = 'receipt'), 6, '0'));
  END IF;
END;

CREATE TRIGGER sales_receipt_number BEFORE INSERT ON sales FOR EACH ROW
BEGIN
  IF NEW.receipt_number = '' THEN
    UPDATE receipt_counters SET value = value + 1 WHERE name = 'sale';
    SET NEW.receipt_number = CONCAT('VNT-', YEAR(NOW()), '-', LPAD((SELECT value FROM receipt_counters WHERE name = 'sale'), 6, '0'));
  END IF;
END;

CREATE TRIGGER expenses_voucher_number BEFORE INSERT ON expenses FOR EACH ROW
BEGIN
  IF NEW.voucher_number = '' THEN
    UPDATE receipt_counters SET value = value + 1 WHERE name = 'expense';
    SET NEW.voucher_number = CONCAT('DEP-', YEAR(NOW()), '-', LPAD((SELECT value FROM receipt_counters WHERE name = 'expense'), 6, '0'));
  END IF;
END;

-- ---------- Users and security ----------

CREATE TABLE users (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  username             VARCHAR(40) NOT NULL UNIQUE,
  full_name            VARCHAR(150) NOT NULL,
  email                VARCHAR(150),
  phone                VARCHAR(30),
  role                 ENUM('admin','principal','registrar','bursar','cashier','teacher') NOT NULL,
  teacher_id           INT UNIQUE,
  password_hash        TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  mfa_method           ENUM('totp','email','sms') NOT NULL DEFAULT 'email',
  totp_secret          TEXT,
  totp_confirmed       BOOLEAN NOT NULL DEFAULT false,
  totp_last_step       BIGINT,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  failed_attempts      INT NOT NULL DEFAULT 0,
  locked_until         DATETIME(3),
  last_login_at        DATETIME(3),
  password_changed_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT users_check CHECK (mfa_method <> 'email' OR email IS NOT NULL),
  CONSTRAINT users_check1 CHECK (mfa_method <> 'sms' OR phone IS NOT NULL),
  CONSTRAINT users_check2 CHECK (role <> 'teacher' OR teacher_id IS NOT NULL),
  CONSTRAINT users_username_check CHECK (REGEXP_LIKE(username, '^[a-z0-9._-]{3,40}$', 'c')),
  -- RESTRICT (PostgreSQL: SET NULL): MySQL forbids referential actions on a column used in a CHECK.
  -- The effect is the same for teacher accounts, whose teacher_id can't be NULL.
  CONSTRAINT users_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE RESTRICT
);

CREATE TABLE sessions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  token_hash   VARCHAR(128) NOT NULL UNIQUE,
  ip           VARCHAR(64),
  user_agent   TEXT,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at   DATETIME(3) NOT NULL,
  KEY idx_sessions_user (user_id),
  CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE auth_challenges (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT NOT NULL,
  token_hash     VARCHAR(128) NOT NULL UNIQUE,
  purpose        VARCHAR(20) NOT NULL,
  method         ENUM('totp','email','sms') NOT NULL,
  code_hash      TEXT,
  pending_secret TEXT,
  attempts       INT NOT NULL DEFAULT 0,
  sent_at        DATETIME(3),
  expires_at     DATETIME(3) NOT NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_auth_challenges_user (user_id),
  CONSTRAINT auth_challenges_purpose_check CHECK (purpose IN ('login', 'totp_setup')),
  CONSTRAINT auth_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE auth_events (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT,
  username   VARCHAR(100),
  event      VARCHAR(60) NOT NULL,
  detail     TEXT,
  ip         VARCHAR(64),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_auth_events_user (user_id, created_at DESC),
  CONSTRAINT auth_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ---------- Timetable and attendance ----------

CREATE TABLE timetable_slots (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  class_id   INT NOT NULL,
  course_id  INT NOT NULL,
  teacher_id INT,
  weekday    SMALLINT NOT NULL,
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  room       VARCHAR(30),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_slots_class_day (class_id, weekday, start_time),
  KEY idx_slots_teacher_day (teacher_id, weekday),
  CONSTRAINT timetable_slots_check CHECK (end_time > start_time),
  CONSTRAINT timetable_slots_weekday_check CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT timetable_slots_class_id_course_id_fkey FOREIGN KEY (class_id, course_id) REFERENCES class_courses(class_id, course_id) ON DELETE CASCADE,
  CONSTRAINT timetable_slots_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE TABLE attendance_sessions (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  slot_id    INT,
  class_id   INT NOT NULL,
  course_id  INT NOT NULL,
  teacher_id INT,
  date       DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  taken_by   INT,
  taken_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY attendance_sessions_slot_id_date_key (slot_id, date),
  KEY idx_att_sessions_class_date (class_id, date),
  KEY idx_att_sessions_date (date),
  CONSTRAINT attendance_sessions_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES timetable_slots(id) ON DELETE SET NULL,
  CONSTRAINT attendance_sessions_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT attendance_sessions_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT attendance_sessions_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
  CONSTRAINT attendance_sessions_taken_by_fkey FOREIGN KEY (taken_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE attendance_records (
  session_id   INT NOT NULL,
  student_id   INT NOT NULL,
  status       ENUM('present','absent','late','excused') NOT NULL,
  minutes_late SMALLINT,
  note         VARCHAR(200),
  PRIMARY KEY (session_id, student_id),
  KEY idx_att_records_student (student_id),
  CONSTRAINT attendance_records_minutes_late_check CHECK (minutes_late > 0),
  CONSTRAINT attendance_records_session_id_fkey FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  CONSTRAINT attendance_records_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- ---------- Views ----------

-- Paid, balance and whether the registration can be confirmed (fully paid, or 1st instalment of an approved plan paid)
CREATE VIEW registration_balances AS
SELECT r.id AS registration_id,
       r.tuition_fee AS fee,
       CAST(COALESCE(SUM(CASE WHEN p.voided_at IS NULL THEN p.amount END), 0) AS SIGNED) AS paid,
       CAST(r.tuition_fee - COALESCE(SUM(CASE WHEN p.voided_at IS NULL THEN p.amount END), 0) AS SIGNED) AS balance,
       COALESCE(SUM(CASE WHEN p.voided_at IS NULL THEN p.amount END), 0) >= LEAST(r.tuition_fee, COALESCE((
         SELECT i.amount FROM instalment_plans ip JOIN instalments i ON i.plan_id = ip.id AND i.number = 1
         WHERE ip.registration_id = r.id AND ip.status = 'approved'), r.tuition_fee)) AS confirmable
FROM registrations r
LEFT JOIN payments p ON p.registration_id = r.id
GROUP BY r.id;

-- Payments spread over the instalments in order (running SUM() OVER)
CREATE VIEW instalment_progress AS
SELECT id, plan_id, number, due_date, amount, registration_id, plan_status, paid,
       CASE WHEN paid >= amount THEN 'paid'
            WHEN due_date < CURRENT_DATE THEN 'overdue'
            WHEN paid > 0 THEN 'partial'
            ELSE 'upcoming' END AS status
FROM (
  SELECT i.id, i.plan_id, i.number, i.due_date, i.amount, ip.registration_id, ip.status AS plan_status,
         CAST(LEAST(i.amount, GREATEST(0, rb.paid - (SUM(i.amount) OVER w - i.amount))) AS SIGNED) AS paid
  FROM instalments i
  JOIN instalment_plans ip ON ip.id = i.plan_id
  JOIN registration_balances rb ON rb.registration_id = ip.registration_id
  WINDOW w AS (PARTITION BY i.plan_id ORDER BY i.number)
) x;

CREATE VIEW sale_totals AS
SELECT s.id AS sale_id,
       CAST(COALESCE(SUM(si.amount), 0) AS SIGNED) AS total,
       CAST(COALESCE(SUM(si.quantity), 0) AS SIGNED) AS items
FROM sales s
LEFT JOIN sale_items si ON si.sale_id = s.id
GROUP BY s.id;
