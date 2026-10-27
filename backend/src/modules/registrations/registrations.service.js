import { pool } from '../../db/pool.js';
import { HttpError } from '../../middleware/errors.js';

/**
 * Registers a student in a class inside a transaction.
 * SELECT ... FOR UPDATE locks the class row so two concurrent registrations
 * cannot both pass the capacity check (avoids a race condition).
 */
export async function register({ student_id, class_id, status = 'pending' }) {
  if (!student_id || !class_id) throw new HttpError(400, 'Missing: student_id, class_id');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [cls] } = await client.query('SELECT * FROM classes WHERE id = $1 FOR UPDATE', [class_id]);
    if (!cls) throw new HttpError(404, 'Class not found');

    const { rowCount: already } = await client.query(
      'SELECT 1 FROM registrations WHERE student_id = $1 AND academic_year = $2', [student_id, cls.academic_year]);
    if (already) throw new HttpError(409, 'Student already registered for this academic year');

    const { rows: [{ count }] } = await client.query(
      "SELECT count(*)::int FROM registrations WHERE class_id = $1 AND status <> 'cancelled'", [class_id]);
    if (count >= cls.capacity) throw new HttpError(409, 'Class is full');

    const { rows: [reg] } = await client.query(
      `INSERT INTO registrations (student_id, class_id, academic_year, status)
       VALUES ($1, $2, $3, $4) RETURNING *`, [student_id, class_id, cls.academic_year, status]);
    await client.query('COMMIT');
    return reg;
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') throw new HttpError(409, 'Student already registered for this academic year');
    throw e;
  } finally {
    client.release();
  }
}
