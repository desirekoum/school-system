import { Router } from 'express';
import { query } from '../db/pool.js';
import { HttpError } from '../middleware/errors.js';

/**
 * Generic CRUD repository + router for a table.
 * `fields` is a whitelist: only these columns can be written (prevents mass assignment).
 */
export function crudRouter({ table, fields, required = [], orderBy = 'id', listSql }) {
  const router = Router();

  // Empty form inputs ('') become NULL so optional columns stay valid
  const pick = (body) => Object.fromEntries(
    fields.filter(f => body[f] !== undefined).map(f => [f, body[f] === '' ? null : body[f]]));

  router.get('/', async (req, res) => {
    const { rows } = await query(listSql ?? `SELECT * FROM ${table} ORDER BY ${orderBy}`);
    res.json(rows);
  });

  router.get('/:id', async (req, res) => {
    const { rows } = await query(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id]);
    if (!rows[0]) throw new HttpError(404, 'Not found');
    res.json(rows[0]);
  });

  router.post('/', async (req, res) => {
    const data = pick(req.body);
    const missing = required.filter(f => data[f] === undefined || data[f] === '');
    if (missing.length) throw new HttpError(400, `Missing: ${missing.join(', ')}`);
    const cols = Object.keys(data);
    // Parameterized query ($1, $2...) protects against SQL injection
    const { rows } = await query(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      Object.values(data));
    res.status(201).json(rows[0]);
  });

  router.put('/:id', async (req, res) => {
    const data = pick(req.body);
    const cols = Object.keys(data);
    if (!cols.length) throw new HttpError(400, 'No fields to update');
    const { rows } = await query(
      `UPDATE ${table} SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(',')} WHERE id = $${cols.length + 1} RETURNING *`,
      [...Object.values(data), req.params.id]);
    if (!rows[0]) throw new HttpError(404, 'Not found');
    res.json(rows[0]);
  });

  router.delete('/:id', async (req, res) => {
    const { rowCount } = await query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
    if (!rowCount) throw new HttpError(404, 'Not found');
    res.status(204).end();
  });

  return router;
}
