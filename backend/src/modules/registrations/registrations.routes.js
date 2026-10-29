import { Router } from 'express';
import { query } from '../../db/pool.js';
import { HttpError } from '../../middleware/errors.js';
import { register, setStatus } from './registrations.service.js';
import { paginatedList, buildWhere } from '../../db/paginate.js';
import { can } from '../auth/roles.js';

const router = Router();
const STATUSES = ['pending', 'confirmed', 'cancelled'];

const LIST = {
  baseSql: `
    SELECT r.*, s.matricule, s.first_name || ' ' || s.last_name AS student, c.name AS class_name,
           rb.paid, rb.balance
    FROM registrations r
    JOIN students s ON s.id = r.student_id
    JOIN classes c ON c.id = r.class_id
    JOIN registration_balances rb ON rb.registration_id = r.id`,
  orderBy: 'registered_at DESC, id DESC',
  searchColumns: ['student', 'matricule', 'class_name'],
  filters: ['status', 'class_id', 'academic_year'],
};

router.get('/', async (req, res) => {
  if (req.query.page === undefined) {
    const { where, params } = buildWhere(req.query, LIST);
    const { rows } = await query(`SELECT * FROM (${LIST.baseSql}) t ${where} ORDER BY ${LIST.orderBy}`, params);
    return res.json(rows);
  }
  // Per-status counts for the filter tabs: same search, but ignoring the status filter
  const { status, ...withoutStatus } = req.query;
  const { where, params } = buildWhere(withoutStatus, LIST);
  const [page, counts] = await Promise.all([
    paginatedList(req.query, LIST),
    query(`SELECT t.status, count(*)::int AS n FROM (${LIST.baseSql}) t ${where} GROUP BY t.status`, params),
  ]);
  res.json({ ...page, counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.n])) });
});

router.post('/', async (req, res) => {
  // A first payment taken at registration also needs the payment permission
  if (req.body.payment?.amount && !can(req.user, 'payments:write')) throw new HttpError(403, 'Your role cannot record payments');
  if (req.body.plan && !can(req.user, 'plans:request')) throw new HttpError(403, 'Your role cannot request instalment plans');
  if (req.body.payment?.amount) req.body.payment.received_by = req.user.full_name;
  res.status(201).json(await register(req.body));
});

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) throw new HttpError(400, `status must be one of ${STATUSES.join(', ')}`);
  res.json(await setStatus(req.params.id, status));
});

router.delete('/:id', async (req, res) => {
  // Payments are financial records: a paid registration is cancelled, never deleted
  const { rowCount: paid } = await query('SELECT 1 FROM payments WHERE registration_id = $1 LIMIT 1', [req.params.id]);
  if (paid) throw new HttpError(409, 'This registration has payments: cancel it instead of deleting it');
  const { rowCount } = await query('DELETE FROM registrations WHERE id = $1', [req.params.id]);
  if (!rowCount) throw new HttpError(404, 'Not found');
  res.status(204).end();
});

export default router;
