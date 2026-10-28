import { pool, query } from '../../db/pool.js';
import { HttpError } from '../../middleware/errors.js';

export const METHODS = ['cash', 'mobile_money', 'bank_transfer', 'cheque'];
export const MAX_INSTALMENTS = 6;

const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? '')) && !Number.isNaN(Date.parse(d));
const isAmount = (n) => Number.isInteger(n) && n > 0;

/** Runs fn(client) inside a transaction. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Locks the registration row so concurrent payments on the same student are serialized,
 * THEN reads the balance: read in the same statement, it could be computed from a snapshot
 * taken before the other transaction committed its payment.
 */
async function lockRegistration(client, id) {
  const { rows: [reg] } = await client.query('SELECT * FROM registrations WHERE id = $1 FOR UPDATE', [id]);
  if (!reg) throw new HttpError(404, 'Registration not found');
  const { rows: [b] } = await client.query('SELECT paid, balance FROM registration_balances WHERE registration_id = $1', [id]);
  return { ...reg, ...b };
}

/**
 * Business rule: a registration is complete (confirmed) once its tuition is fully paid.
 * Cancelled registrations are left alone.
 */
export async function syncStatus(client, registrationId) {
  await client.query(`
    UPDATE registrations r
    SET status = (CASE WHEN rb.balance <= 0 THEN 'confirmed' ELSE 'pending' END)::registration_status
    FROM registration_balances rb
    WHERE rb.registration_id = r.id AND r.id = $1 AND r.status <> 'cancelled'`, [registrationId]);
}

// ---------- Payments ----------

export async function recordPayment(client, { registration_id, amount, method = 'cash', reference, paid_at, received_by, notes }) {
  amount = Number(amount);
  if (!registration_id) throw new HttpError(400, 'Missing: registration_id');
  if (!isAmount(amount)) throw new HttpError(400, 'amount must be a positive whole number of FCFA');
  if (!METHODS.includes(method)) throw new HttpError(400, `method must be one of ${METHODS.join(', ')}`);
  if (paid_at && !isDate(paid_at)) throw new HttpError(400, 'paid_at must be a date (YYYY-MM-DD)');
  if (paid_at && paid_at > new Date().toISOString().slice(0, 10)) throw new HttpError(400, 'paid_at cannot be in the future');
  if (method !== 'cash' && !reference) throw new HttpError(400, 'A reference (transaction id, cheque number...) is required for non-cash payments');

  const reg = await lockRegistration(client, registration_id);
  if (reg.status === 'cancelled') throw new HttpError(409, 'Registration is cancelled');
  if (amount > reg.balance) throw new HttpError(400, `Amount exceeds the balance (${reg.balance} FCFA)`);

  const { rows: [payment] } = await client.query(`
    INSERT INTO payments (registration_id, amount, method, reference, paid_at, received_by, notes)
    VALUES ($1, $2, $3, $4, COALESCE($5::date, current_date), $6, $7) RETURNING *`,
    [registration_id, amount, method, reference || null, paid_at || null, received_by || null, notes || null]);
  await syncStatus(client, registration_id);
  return payment;
}

export async function voidPayment(id, reason) {
  if (!reason?.trim()) throw new HttpError(400, 'A reason is required to void a payment');
  return tx(async (client) => {
    const { rows: [p] } = await client.query('SELECT * FROM payments WHERE id = $1', [id]);
    if (!p) throw new HttpError(404, 'Payment not found');
    if (p.voided_at) throw new HttpError(409, 'Payment already voided');
    await lockRegistration(client, p.registration_id);
    const { rows: [voided] } = await client.query(
      'UPDATE payments SET voided_at = now(), void_reason = $2 WHERE id = $1 RETURNING *', [id, reason.trim()]);
    await syncStatus(client, p.registration_id);
    return voided;
  });
}

/**
 * Everything a receipt shows. Totals are "as of this payment" (valid payments up to and
 * including it), so reprinting an old receipt shows the same figures as the original.
 */
export async function receipt(id) {
  const { rows: [p] } = await query(`
    SELECT p.*, s.matricule, s.first_name, s.last_name, c.name AS class_name, r.academic_year,
           r.tuition_fee AS fee, x.total_paid, (r.tuition_fee - x.total_paid)::int AS balance
    FROM payments p
    JOIN registrations r ON r.id = p.registration_id
    JOIN students s ON s.id = r.student_id
    JOIN classes c ON c.id = r.class_id
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(q.amount), 0)::int AS total_paid FROM payments q
      WHERE q.registration_id = p.registration_id AND q.voided_at IS NULL
        AND (q.paid_at, q.id) <= (p.paid_at, p.id)
    ) x
    WHERE p.id = $1`, [id]);
  if (!p) throw new HttpError(404, 'Payment not found');
  return p;
}

// ---------- Instalment plans ----------

/** Splits a fee into n parts rounded to 500 FCFA; the last part takes the remainder. */
export function splitAmount(fee, n) {
  const part = Math.floor(fee / n / 500) * 500 || Math.floor(fee / n);
  return Array.from({ length: n }, (_, i) => (i < n - 1 ? part : fee - part * (n - 1)));
}

function validateInstalments(instalments, fee) {
  if (!Array.isArray(instalments) || instalments.length < 2 || instalments.length > MAX_INSTALMENTS) {
    throw new HttpError(400, `An instalment plan has 2 to ${MAX_INSTALMENTS} instalments`);
  }
  let total = 0;
  instalments.forEach((i, n) => {
    if (!isDate(i.due_date)) throw new HttpError(400, `Instalment ${n + 1}: due_date must be a date (YYYY-MM-DD)`);
    if (!isAmount(Number(i.amount))) throw new HttpError(400, `Instalment ${n + 1}: amount must be a positive whole number`);
    if (n && i.due_date <= instalments[n - 1].due_date) throw new HttpError(400, 'Due dates must be in increasing order');
    total += Number(i.amount);
  });
  if (total !== fee) throw new HttpError(400, `Instalments add up to ${total} FCFA but the tuition fee is ${fee} FCFA`);
}

/** Creates or replaces the plan of a registration. A new request goes back to "requested". */
export async function requestPlan(client, registrationId, { instalments, reason }) {
  const reg = await lockRegistration(client, registrationId);
  if (reg.status === 'cancelled') throw new HttpError(409, 'Registration is cancelled');
  if (reg.balance <= 0) throw new HttpError(409, 'Tuition already fully paid');
  validateInstalments(instalments, reg.tuition_fee);

  const { rows: [plan] } = await client.query(`
    INSERT INTO instalment_plans (registration_id, reason) VALUES ($1, $2)
    ON CONFLICT (registration_id) DO UPDATE SET status = 'requested', reason = EXCLUDED.reason, requested_at = now(), decided_at = NULL
    RETURNING *`, [registrationId, reason || null]);
  await client.query('DELETE FROM instalments WHERE plan_id = $1', [plan.id]);
  await client.query(`
    INSERT INTO instalments (plan_id, number, due_date, amount)
    SELECT $1, u.ord, u.due_date, u.amount
    FROM unnest($2::date[], $3::int[]) WITH ORDINALITY AS u(due_date, amount, ord)`,
    [plan.id, instalments.map((i) => i.due_date), instalments.map((i) => Number(i.amount))]);
  return plan;
}

export async function decidePlan(planId, status) {
  const { rows: [plan] } = await query(`
    UPDATE instalment_plans SET status = $2, decided_at = now()
    WHERE id = $1 AND status = 'requested' RETURNING *`, [planId, status]);
  if (!plan) {
    const { rowCount } = await query('SELECT 1 FROM instalment_plans WHERE id = $1', [planId]);
    throw new HttpError(rowCount ? 409 : 404, rowCount ? 'Only a requested plan can be approved or rejected' : 'Plan not found');
  }
  return plan;
}

// ---------- Accounts (one per registration) ----------

// Overdue = approved-plan instalments past their due date and not covered by payments
const OVERDUE = `
  SELECT registration_id,
         SUM(amount - paid) FILTER (WHERE status = 'overdue')::int AS overdue,
         MIN(due_date) FILTER (WHERE status <> 'paid') AS next_due_date
  FROM instalment_progress WHERE plan_status = 'approved'
  GROUP BY registration_id`;

export const ACCOUNTS = {
  baseSql: `
    SELECT r.id, r.student_id, r.class_id, r.academic_year, r.status, r.registered_at,
           s.matricule, s.first_name || ' ' || s.last_name AS student, s.photo_url, c.name AS class_name,
           rb.fee, rb.paid, rb.balance,
           CASE WHEN rb.balance <= 0 THEN 'paid' WHEN rb.paid > 0 THEN 'partial' ELSE 'unpaid' END AS payment_status,
           ip.id AS plan_id, ip.status AS plan_status,
           COALESCE(od.overdue, 0) AS overdue, od.next_due_date,
           COALESCE(od.overdue, 0) > 0 AS is_overdue
    FROM registrations r
    JOIN students s ON s.id = r.student_id
    JOIN classes c ON c.id = r.class_id
    JOIN registration_balances rb ON rb.registration_id = r.id
    LEFT JOIN instalment_plans ip ON ip.registration_id = r.id
    LEFT JOIN (${OVERDUE}) od ON od.registration_id = r.id`,
  orderBy: 'student',
  searchColumns: ['student', 'matricule', 'class_name'],
  filters: ['academic_year', 'class_id', 'student_id', 'status', 'payment_status', 'plan_status', 'is_overdue'],
};

/** Statement of one registration: fee, balance, plan with instalment progress, payment history. */
export async function account(registrationId) {
  const { rows: [acc] } = await query(`SELECT * FROM (${ACCOUNTS.baseSql}) t WHERE t.id = $1`, [registrationId]);
  if (!acc) throw new HttpError(404, 'Registration not found');
  const [plan, instalments, payments] = await Promise.all([
    query('SELECT * FROM instalment_plans WHERE registration_id = $1', [registrationId]),
    query('SELECT * FROM instalment_progress WHERE registration_id = $1 ORDER BY number', [registrationId]),
    query('SELECT * FROM payments WHERE registration_id = $1 ORDER BY paid_at DESC, id DESC', [registrationId]),
  ]);
  return {
    ...acc,
    plan: plan.rows[0] ? { ...plan.rows[0], instalments: instalments.rows } : null,
    payments: payments.rows,
  };
}

// ---------- Reports ----------

/** Financial report of an academic year: tuition, sales, expenses, cash flow per month, debtors. */
export async function report(academicYear) {
  if (!academicYear) {
    const { rows: [y] } = await query('SELECT name FROM academic_years ORDER BY is_current DESC, name DESC LIMIT 1');
    academicYear = y?.name;
  }
  // Cancelled registrations owe nothing and are left out of every figure
  const ACTIVE = `SELECT * FROM (${ACCOUNTS.baseSql}) a WHERE a.academic_year = $1 AND a.status <> 'cancelled'`;
  const LIVE_PAYMENTS = `
    SELECT p.* FROM payments p JOIN registrations r ON r.id = p.registration_id
    WHERE p.voided_at IS NULL AND r.academic_year = $1 AND r.status <> 'cancelled'`;

  const LIVE_SALES = `SELECT s.*, st.total FROM sales s JOIN sale_totals st ON st.sale_id = s.id
                      WHERE s.voided_at IS NULL AND s.academic_year = $1`;
  const LIVE_EXPENSES = 'SELECT * FROM expenses WHERE voided_at IS NULL AND academic_year = $1';

  const [totals, byClass, byMethod, monthly, debtors, plans, salesTotals, expenseTotals, byCategory, topItems] = await Promise.all([
    query(`
      SELECT count(*)::int AS registrations,
             COALESCE(SUM(fee), 0)::bigint::float AS expected,
             COALESCE(SUM(paid), 0)::bigint::float AS collected,
             COALESCE(SUM(balance), 0)::bigint::float AS outstanding,
             COALESCE(SUM(overdue), 0)::bigint::float AS overdue,
             count(*) FILTER (WHERE payment_status = 'paid')::int AS paid_count,
             count(*) FILTER (WHERE payment_status = 'partial')::int AS partial_count,
             count(*) FILTER (WHERE payment_status = 'unpaid')::int AS unpaid_count,
             count(*) FILTER (WHERE is_overdue)::int AS overdue_count
      FROM (${ACTIVE}) t`, [academicYear]),
    query(`
      SELECT c.id, c.name, c.level, c.tuition_fee,
             count(t.id)::int AS students,
             COALESCE(SUM(t.fee), 0)::int AS expected,
             COALESCE(SUM(t.paid), 0)::int AS collected,
             COALESCE(SUM(t.balance), 0)::int AS outstanding,
             count(t.id) FILTER (WHERE t.payment_status = 'paid')::int AS paid_count
      FROM classes c LEFT JOIN (${ACTIVE}) t ON t.class_id = c.id
      WHERE c.academic_year = $1
      GROUP BY c.id ORDER BY c.name`, [academicYear]),
    query(`SELECT method, count(*)::int AS count, SUM(amount)::int AS total
           FROM (${LIVE_PAYMENTS}) p GROUP BY method ORDER BY total DESC`, [academicYear]),
    // Cash flow per month. Every money movement of the year becomes one row (UNION ALL),
    // and generate_series fills months with no movement so the chart has no gaps.
    query(`
      WITH moves AS (
        SELECT paid_at AS day, amount, 'tuition' AS kind FROM (${LIVE_PAYMENTS}) p
        UNION ALL
        SELECT s.sold_at, st.total, 'sales' FROM sales s JOIN sale_totals st ON st.sale_id = s.id
        WHERE s.voided_at IS NULL AND s.academic_year = $1
        UNION ALL
        SELECT e.spent_at, e.amount, 'expenses' FROM expenses e WHERE e.voided_at IS NULL AND e.academic_year = $1
      ),
      bounds AS (
        SELECT date_trunc('month', LEAST(MIN(m.day), ay.start_date))::date AS first,
               date_trunc('month', GREATEST(MAX(m.day), LEAST(current_date, ay.end_date)))::date AS last
        FROM academic_years ay LEFT JOIN moves m ON true
        WHERE ay.name = $1 GROUP BY ay.start_date, ay.end_date
      )
      SELECT to_char(mo, 'YYYY-MM') AS month,
             COALESCE(SUM(m.amount) FILTER (WHERE m.kind = 'tuition'), 0)::int AS tuition,
             COALESCE(SUM(m.amount) FILTER (WHERE m.kind = 'sales'), 0)::int AS sales,
             COALESCE(SUM(m.amount) FILTER (WHERE m.kind = 'expenses'), 0)::int AS expenses
      FROM bounds, generate_series(bounds.first, bounds.last, interval '1 month') AS mo
      LEFT JOIN moves m ON date_trunc('month', m.day) = mo
      GROUP BY mo ORDER BY mo`, [academicYear]),
    query(`SELECT id, student, matricule, class_name, fee, paid, balance, overdue, next_due_date, plan_status
           FROM (${ACTIVE}) t WHERE balance > 0
           ORDER BY overdue DESC, balance DESC, student LIMIT 20`, [academicYear]),
    query(`SELECT ip.status, count(*)::int AS n FROM instalment_plans ip
           JOIN registrations r ON r.id = ip.registration_id
           WHERE r.academic_year = $1 AND r.status <> 'cancelled' GROUP BY ip.status`, [academicYear]),
    query(`SELECT count(*)::int AS count, COALESCE(SUM(total), 0)::bigint::float AS total FROM (${LIVE_SALES}) s`, [academicYear]),
    query(`SELECT count(*)::int AS count, COALESCE(SUM(amount), 0)::bigint::float AS total FROM (${LIVE_EXPENSES}) e`, [academicYear]),
    query(`SELECT category, count(*)::int AS count, SUM(amount)::int AS total
           FROM (${LIVE_EXPENSES}) e GROUP BY category ORDER BY total DESC`, [academicYear]),
    query(`SELECT i.id, i.code, i.name, SUM(si.quantity)::int AS quantity, SUM(si.amount)::int AS total
           FROM (${LIVE_SALES}) s JOIN sale_items si ON si.sale_id = s.id JOIN items i ON i.id = si.item_id
           GROUP BY i.id ORDER BY total DESC LIMIT 10`, [academicYear]),
  ]);

  const t = totals.rows[0];
  const sales = salesTotals.rows[0];
  const spent = expenseTotals.rows[0];
  const income = t.collected + sales.total;
  return {
    // Cash position of the year: money in (tuition + sales) minus money out (expenses)
    cash: { tuition: t.collected, sales: sales.total, sales_count: sales.count, income,
            expenses: spent.total, expenses_count: spent.count, net: income - spent.total },
    by_category: byCategory.rows,
    top_items: topItems.rows,
    academic_year: academicYear,
    totals: { ...t, collection_rate: t.expected ? Math.round((t.collected / t.expected) * 1000) / 10 : null },
    plans: Object.fromEntries(plans.rows.map((p) => [p.status, p.n])),
    by_class: byClass.rows,
    by_method: byMethod.rows,
    monthly: monthly.rows,
    debtors: debtors.rows,
  };
}
