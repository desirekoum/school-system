import { Router } from 'express';
import { query } from '../../db/pool.js';
import { paginatedList, buildWhere, withDateRange, paginatedWithSum, fullList } from '../../db/paginate.js';
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

router.get('/payments', async (req, res) => {
  const opts = withDateRange(req.query, PAYMENTS, 'p.paid_at');
  if (req.query.page === undefined) return res.json(await fullList(req.query, opts));
  res.json(await paginatedWithSum(req.query, opts, 'SUM(amount) FILTER (WHERE NOT voided)'));
});
router.get('/payments/:id', async (req, res) => res.json(await receipt(req.params.id)));
router.post('/payments', async (req, res) => {
  const payment = await tx((client) => recordPayment(client, { ...req.body, received_by: req.user.full_name }));
  res.status(201).json(await receipt(payment.id));
});
router.post('/payments/:id/void', async (req, res) => res.json(await voidPayment(req.params.id, req.body.reason)));

// ---------- Reports ----------
router.get('/report', async (req, res) => res.json(await report(req.query.academic_year)));

export default router;
