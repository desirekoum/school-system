import { pool, query } from '../../db/pool.js';
import { HttpError } from '../../middleware/errors.js';

const DAY = 24 * 60 * 60 * 1000;
const iso = (d) => d.toISOString().slice(0, 10);

/** Splits [start, end] into 3 consecutive periods of (almost) equal length. */
export function splitInTrimesters(start, end) {
  const s = new Date(`${start}T00:00:00Z`).getTime();
  const e = new Date(`${end}T00:00:00Z`).getTime();
  const len = Math.floor((e - s) / DAY / 3);
  return [1, 2, 3].map((n) => ({
    number: n,
    start_date: iso(new Date(s + (n - 1) * len * DAY)),
    end_date: n === 3 ? end : iso(new Date(s + (n * len - 1) * DAY)),
  }));
}

const YEAR_SQL = `
  SELECT ay.*, (SELECT count(*)::int FROM classes c WHERE c.academic_year = ay.name) AS class_count
  FROM academic_years ay`;

// Nests year → trimesters → exams: two flat queries assembled in JS (portable to PostgreSQL and MySQL)
async function withTrimesters(years) {
  if (!years.length) return years;
  const ids = years.map((y) => y.id);
  const { rows: tris } = await query(
    'SELECT id, academic_year_id, number, start_date, end_date FROM trimesters WHERE academic_year_id = ANY($1::int[]) ORDER BY number', [ids]);
  const { rows: exams } = tris.length ? await query(
    'SELECT id, trimester_id, number, exam_date FROM exams WHERE trimester_id = ANY($1::int[]) ORDER BY number', [tris.map((t) => t.id)]) : { rows: [] };
  for (const y of years) {
    y.trimesters = tris.filter((t) => t.academic_year_id === y.id).map(({ academic_year_id, ...t }) => ({
      ...t, exams: exams.filter((e) => e.trimester_id === t.id).map(({ trimester_id, ...e }) => e),
    }));
  }
  return years;
}

export async function getYear(where, params) {
  const { rows } = await query(`${YEAR_SQL} WHERE ${where}`, params);
  if (!rows[0]) throw new HttpError(404, 'Academic year not found');
  return (await withTrimesters(rows))[0];
}

export const listYears = async () => withTrimesters((await query(`${YEAR_SQL} ORDER BY ay.name DESC`)).rows);

function validate({ name, start_date, end_date }) {
  if (!name || !start_date || !end_date) throw new HttpError(400, 'Missing: name, start_date, end_date');
  const m = /^(\d{4})-(\d{4})$/.exec(name);
  if (!m || Number(m[2]) !== Number(m[1]) + 1) throw new HttpError(400, 'Name must look like 2026-2027');
  if (end_date <= start_date) throw new HttpError(400, 'End date must be after start date');
}

/** Creates the year with its 3 trimesters and 6 exams in one transaction (all or nothing). */
export async function createYear(data) {
  validate(data);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (data.is_current) await client.query('UPDATE academic_years SET is_current = false WHERE is_current');
    const { rows: [year] } = await client.query(
      'INSERT INTO academic_years (name, start_date, end_date, is_current) VALUES ($1, $2, $3, $4) RETURNING id',
      [data.name, data.start_date, data.end_date, !!data.is_current]);
    for (const t of splitInTrimesters(data.start_date, data.end_date)) {
      const { rows: [tri] } = await client.query(
        'INSERT INTO trimesters (academic_year_id, number, start_date, end_date) VALUES ($1, $2, $3, $4) RETURNING id',
        [year.id, t.number, t.start_date, t.end_date]);
      await client.query('INSERT INTO exams (trimester_id, number) VALUES ($1, 1), ($1, 2)', [tri.id]);
    }
    await client.query('COMMIT');
    return getYear('ay.id = $1', [year.id]);
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') throw new HttpError(409, `Academic year ${data.name} already exists`);
    throw e;
  } finally {
    client.release();
  }
}

export async function updateYear(id, data) {
  validate(data);
  const { rowCount } = await query(
    'UPDATE academic_years SET name = $1, start_date = $2, end_date = $3 WHERE id = $4',
    [data.name, data.start_date, data.end_date, id]);
  if (!rowCount) throw new HttpError(404, 'Academic year not found');
  return getYear('ay.id = $1', [id]);
}

export async function setCurrent(id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE academic_years SET is_current = false WHERE is_current');
    const { rowCount } = await client.query('UPDATE academic_years SET is_current = true WHERE id = $1', [id]);
    if (!rowCount) throw new HttpError(404, 'Academic year not found');
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return getYear('ay.id = $1', [id]);
}
