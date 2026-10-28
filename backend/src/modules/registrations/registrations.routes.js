import { Router } from 'express';
import { query } from '../../db/pool.js';
import { HttpError } from '../../middleware/errors.js';
import { register } from './registrations.service.js';
import { paginatedList, buildWhere } from '../../db/paginate.js';

const router = Router();
const STATUSES = ['pending', 'confirmed', 'cancelled'];

const LIST = {
  baseSql: `
    SELECT r.*, s.matricule, s.first_name || ' ' || s.last_name AS student, c.name AS class_name
    FROM registrations r
    JOIN students s ON s.id = r.student_id
    JOIN classes c ON c.id = r.class_id`,
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
  res.status(201).json(await register(req.body));
});

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) throw new HttpError(400, `status must be one of ${STATUSES.join(', ')}`);
  const { rows } = await query('UPDATE registrations SET status = $1 WHERE id = $2 RETURNING *', [status, req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Not found');
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const { rowCount } = await query('DELETE FROM registrations WHERE id = $1', [req.params.id]);
  if (!rowCount) throw new HttpError(404, 'Not found');
  res.status(204).end();
});

export default router;
