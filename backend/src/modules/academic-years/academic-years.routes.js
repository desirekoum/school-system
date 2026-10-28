import { Router } from 'express';
import { query } from '../../db/pool.js';
import { HttpError } from '../../middleware/errors.js';
import { listYears, getYear, createYear, updateYear, setCurrent } from './academic-years.service.js';

const router = Router();

router.get('/', async (req, res) => res.json(await listYears()));
router.get('/current', async (req, res) => res.json(await getYear('ay.is_current', [])));
router.get('/:id', async (req, res) => res.json(await getYear('ay.id = $1', [req.params.id])));
router.post('/', async (req, res) => res.status(201).json(await createYear(req.body)));
router.put('/:id', async (req, res) => res.json(await updateYear(req.params.id, req.body)));
router.post('/:id/current', async (req, res) => res.json(await setCurrent(req.params.id)));

// Deleting a year that classes still use is refused by the FK (→ 409)
router.delete('/:id', async (req, res) => {
  const { rowCount } = await query('DELETE FROM academic_years WHERE id = $1', [req.params.id]);
  if (!rowCount) throw new HttpError(404, 'Academic year not found');
  res.status(204).end();
});

router.put('/trimesters/:id', async (req, res) => {
  const { start_date = null, end_date = null } = req.body;
  if (start_date && end_date && end_date <= start_date) throw new HttpError(400, 'End date must be after start date');
  const { rows } = await query('UPDATE trimesters SET start_date = $1, end_date = $2 WHERE id = $3 RETURNING *',
    [start_date || null, end_date || null, req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Trimester not found');
  res.json(rows[0]);
});

router.put('/exams/:id', async (req, res) => {
  const { rows } = await query('UPDATE exams SET exam_date = $1 WHERE id = $2 RETURNING *',
    [req.body.exam_date || null, req.params.id]);
  if (!rows[0]) throw new HttpError(404, 'Exam not found');
  res.json(rows[0]);
});

export default router;
