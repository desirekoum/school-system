import { Router } from 'express';
import { query } from '../../db/pool.js';
import { HttpError } from '../../middleware/errors.js';
import { paginatedList, buildWhere } from '../../db/paginate.js';
import {
  tx, recordPayment, voidPayment, receipt, requestPlan, decidePlan, account, report, ACCOUNTS,
} from './finances.service.js';

const router = Router();

// ---------- Accounts: fee, paid and balance of every registration ----------
router.get('/accounts', async (req, res) => {
  if (req.query.page !== undefined) return res.json(await paginatedList(req.query, ACCOUNTS));
  const { where, params } = buildWhere(req.query, ACCOUNTS);
  const { rows } = await query(`SELECT * FROM (${ACCOUNTS.baseSql}) t ${where} ORDER BY ${ACCOUNTS.orderBy}`, params);
  res.json(rows);
});
router.get('/accounts/:id', async (req, res) => res.json(await account(req.params.id)));

// ---------- Instalment plans ----------
router.put('/accounts/:id/plan', async (req, res) => {
  await tx((client) => requestPlan(client, req.params.id, req.body));
  res.json(await account(req.params.id));
});
router.delete('/accounts/:id/plan', async (req, res) => {
  await query('DELETE FROM instalment_plans WHERE registration_id = $1', [req.params.id]);
  res.status(204).end();
});
router.post('/plans/:id/approve', async (req, res) => res.json(await decidePlan(req.params.id, 'approved')));
router.post('/plans/:id/reject', async (req, res) => res.json(await decidePlan(req.params.id, 'rejected')));

// ---------- Payments (journal) ----------
const PAYMENTS = {
  baseSql: `
    SELECT p.*, r.academic_year, r.class_id, r.student_id, c.name AS class_name,
           s.matricule, s.first_name || ' ' || s.last_name AS student,
           (p.voided_at IS NOT NULL) AS voided
    FROM payments p
    JOIN registrations r ON r.id = p.registration_id
    JOIN students s ON s.id = r.student_id
    JOIN classes c ON c.id = r.class_id`,
  orderBy: 'paid_at DESC, id DESC',
  searchColumns: ['receipt_number', 'student', 'matricule', 'reference'],
  filters: ['academic_year', 'class_id', 'method', 'voided'],
};

// Date range on top of the generic filters: ?from=YYYY-MM-DD&to=YYYY-MM-DD
function withRange(q) {
  const params = [];
  const conds = [];
  for (const [key, op] of [['from', '>='], ['to', '<=']]) {
    if (!q[key]) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q[key])) throw new HttpError(400, `${key} must be a date (YYYY-MM-DD)`);
    params.push(q[key]);
    conds.push(`p.paid_at ${op} $${params.length}`);
  }
  return { ...PAYMENTS, baseSql: PAYMENTS.baseSql + (conds.length ? ` WHERE ${conds.join(' AND ')}` : ''), baseParams: params };
}

router.get('/payments', async (req, res) => {
  const opts = withRange(req.query);
  if (req.query.page !== undefined) {
    const page = await paginatedList(req.query, opts);
    // Sum of the whole filtered set (not just this page), for the journal footer
    const { where, params } = buildWhere(req.query, opts, [...opts.baseParams]);
    const { rows: [sum] } = await query(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE NOT voided), 0)::bigint::float AS total FROM (${opts.baseSql}) t ${where}`, params);
    return res.json({ ...page, sum: sum.total });
  }
  const { where, params } = buildWhere(req.query, opts, [...opts.baseParams]);
  const { rows } = await query(`SELECT * FROM (${opts.baseSql}) t ${where} ORDER BY ${opts.orderBy}`, params);
  res.json(rows);
});
router.get('/payments/:id', async (req, res) => res.json(await receipt(req.params.id)));
router.post('/payments', async (req, res) => {
  const payment = await tx((client) => recordPayment(client, req.body));
  res.status(201).json(await receipt(payment.id));
});
router.post('/payments/:id/void', async (req, res) => res.json(await voidPayment(req.params.id, req.body.reason)));

// ---------- Reports ----------
router.get('/report', async (req, res) => res.json(await report(req.query.academic_year)));

export default router;
