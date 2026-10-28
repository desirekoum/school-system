-- Items the school sells (uniforms, books, ID cards...), sales to students, and expenses.
-- Amounts in whole FCFA. Sales and expenses are voided, never deleted.

CREATE TABLE IF NOT EXISTS items (
  id          SERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'other'
              CHECK (category IN ('uniform', 'books', 'supplies', 'documents', 'services', 'other')),
  price       INT NOT NULL CHECK (price >= 0),
  stock       INT CHECK (stock >= 0),      -- NULL = not tracked (services, fees)
  is_active   BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS sale_seq;

CREATE TABLE IF NOT EXISTS sales (
  id             SERIAL PRIMARY KEY,
  receipt_number TEXT NOT NULL UNIQUE
                 DEFAULT 'VNT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('sale_seq')::text, 6, '0'),
  student_id     INT REFERENCES students(id) ON DELETE RESTRICT,   -- NULL = walk-in buyer
  buyer_name     TEXT,
  academic_year  TEXT NOT NULL REFERENCES academic_years(name) ON UPDATE CASCADE,
  sold_at        DATE NOT NULL DEFAULT current_date,
  method         payment_method NOT NULL DEFAULT 'cash',
  reference      TEXT,
  received_by    TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  voided_at      TIMESTAMPTZ,
  void_reason    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON sales(sold_at);
CREATE INDEX IF NOT EXISTS idx_sales_student ON sales(student_id);

-- Price copied at sale time: changing the catalog price later doesn't rewrite old receipts.
-- amount is a GENERATED column: always quantity × unit_price, computed by PostgreSQL.
CREATE TABLE IF NOT EXISTS sale_items (
  id         SERIAL PRIMARY KEY,
  sale_id    INT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  item_id    INT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  quantity   INT NOT NULL CHECK (quantity > 0),
  unit_price INT NOT NULL CHECK (unit_price >= 0),
  amount     INT GENERATED ALWAYS AS (quantity * unit_price) STORED
);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_item ON sale_items(item_id);

CREATE SEQUENCE IF NOT EXISTS expense_seq;

-- Money spent. A purchase of a catalog item (item_id) adds `quantity` to its stock.
CREATE TABLE IF NOT EXISTS expenses (
  id            SERIAL PRIMARY KEY,
  voucher_number TEXT NOT NULL UNIQUE
                 DEFAULT 'DEP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('expense_seq')::text, 6, '0'),
  academic_year TEXT NOT NULL REFERENCES academic_years(name) ON UPDATE CASCADE,
  category      TEXT NOT NULL DEFAULT 'other'
                CHECK (category IN ('stock', 'supplies', 'furniture', 'equipment', 'maintenance', 'utilities', 'transport', 'events', 'other')),
  description   TEXT NOT NULL,
  supplier      TEXT,
  item_id       INT REFERENCES items(id) ON DELETE RESTRICT,
  quantity      INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price    INT NOT NULL CHECK (unit_price > 0),
  amount        INT GENERATED ALWAYS AS (quantity * unit_price) STORED,
  spent_at      DATE NOT NULL DEFAULT current_date,
  method        payment_method NOT NULL DEFAULT 'cash',
  reference     TEXT,
  approved_by   TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  voided_at     TIMESTAMPTZ,
  void_reason   TEXT
);
CREATE INDEX IF NOT EXISTS idx_expenses_spent_at ON expenses(spent_at);
CREATE INDEX IF NOT EXISTS idx_expenses_year ON expenses(academic_year);

-- Total of each sale (valid lines only matter through voided_at on the sale)
CREATE OR REPLACE VIEW sale_totals AS
SELECT s.id AS sale_id, COALESCE(SUM(si.amount), 0)::int AS total, COALESCE(SUM(si.quantity), 0)::int AS items
FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id
GROUP BY s.id;
