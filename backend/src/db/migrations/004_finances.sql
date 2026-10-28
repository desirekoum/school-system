-- Finances: tuition fee per class, instalment plans, payments.
-- Amounts are whole FCFA (XAF has no sub-unit), stored as INT.

ALTER TABLE classes ADD COLUMN IF NOT EXISTS tuition_fee INT NOT NULL DEFAULT 0 CHECK (tuition_fee >= 0);

-- Fee frozen at registration time: raising the class fee later does not change what a registered student owes
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS tuition_fee INT NOT NULL DEFAULT 0 CHECK (tuition_fee >= 0);

DO $$ BEGIN
  CREATE TYPE plan_status AS ENUM ('requested', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One instalment plan per registration (a new request replaces the previous one)
CREATE TABLE IF NOT EXISTS instalment_plans (
  id              SERIAL PRIMARY KEY,
  registration_id INT NOT NULL UNIQUE REFERENCES registrations(id) ON DELETE CASCADE,
  status          plan_status NOT NULL DEFAULT 'requested',
  reason          TEXT,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS instalments (
  id       SERIAL PRIMARY KEY,
  plan_id  INT NOT NULL REFERENCES instalment_plans(id) ON DELETE CASCADE,
  number   SMALLINT NOT NULL CHECK (number BETWEEN 1 AND 12),
  due_date DATE NOT NULL,
  amount   INT NOT NULL CHECK (amount > 0),
  UNIQUE (plan_id, number)
);

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('cash', 'mobile_money', 'bank_transfer', 'cheque');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SEQUENCE IF NOT EXISTS receipt_seq;

-- Payments are never deleted: a mistake is voided, which keeps the audit trail
CREATE TABLE IF NOT EXISTS payments (
  id              SERIAL PRIMARY KEY,
  registration_id INT NOT NULL REFERENCES registrations(id) ON DELETE RESTRICT,
  receipt_number  TEXT NOT NULL UNIQUE
                  DEFAULT 'REC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('receipt_seq')::text, 6, '0'),
  amount          INT NOT NULL CHECK (amount > 0),
  method          payment_method NOT NULL DEFAULT 'cash',
  reference       TEXT,           -- mobile money transaction id, cheque number...
  paid_at         DATE NOT NULL DEFAULT current_date,
  received_by     TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  voided_at       TIMESTAMPTZ,
  void_reason     TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_registration ON payments(registration_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at);

-- What each registration owes, has paid (voided payments excluded) and still owes
CREATE OR REPLACE VIEW registration_balances AS
SELECT r.id AS registration_id,
       r.tuition_fee AS fee,
       COALESCE(SUM(p.amount) FILTER (WHERE p.voided_at IS NULL), 0)::int AS paid,
       (r.tuition_fee - COALESCE(SUM(p.amount) FILTER (WHERE p.voided_at IS NULL), 0))::int AS balance
FROM registrations r
LEFT JOIN payments p ON p.registration_id = r.id
GROUP BY r.id;

-- Payments fill the instalments in order: the running total of the amounts due
-- (SUM ... OVER, a window function) tells how much of the paid total reaches each instalment.
CREATE OR REPLACE VIEW instalment_progress AS
SELECT x.*,
       CASE WHEN x.paid >= x.amount THEN 'paid'
            WHEN x.due_date < current_date THEN 'overdue'
            WHEN x.paid > 0 THEN 'partial'
            ELSE 'upcoming' END AS status
FROM (
  SELECT i.id, i.plan_id, i.number, i.due_date, i.amount,
         ip.registration_id, ip.status AS plan_status,
         LEAST(i.amount, GREATEST(0, rb.paid - (SUM(i.amount) OVER w - i.amount)))::int AS paid
  FROM instalments i
  JOIN instalment_plans ip ON ip.id = i.plan_id
  JOIN registration_balances rb ON rb.registration_id = ip.registration_id
  WINDOW w AS (PARTITION BY i.plan_id ORDER BY i.number)
) x;
