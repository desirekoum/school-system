import { crudRouter } from '../crud.js';
import { query, pool } from '../../db/pool.js';
import { HttpError } from '../../middleware/errors.js';
import { reportCard } from '../grades/grades.service.js';

const router = crudRouter({
  table: 'students',
  fields: [
    'matricule', 'first_name', 'last_name', 'birth_date', 'birth_place', 'gender', 'nationality',
    'email', 'phone', 'address', 'photo_url', 'blood_group', 'allergies', 'medical_notes',
    'previous_school', 'admission_date', 'status', 'emergency_contact_name', 'emergency_contact_phone',
  ],
  required: ['matricule', 'first_name', 'last_name'],
  // Shows the primary guardian in the list without a second request per row
  listSql: `
    SELECT s.*, NULLIF(concat_ws(' ', g.first_name, g.last_name), '') AS primary_guardian, g.phone AS primary_guardian_phone
    FROM students s
    LEFT JOIN student_guardians sg ON sg.student_id = s.id AND sg.is_primary
    LEFT JOIN guardians g ON g.id = sg.guardian_id`,
  orderBy: 'last_name, first_name',
  searchColumns: ['matricule', 'first_name', 'last_name', 'email', 'phone', 'primary_guardian'],
  filters: ['status', 'gender'],
});

const GUARDIAN_FIELDS = ['first_name', 'last_name', 'phone', 'email', 'profession', 'address'];

router.get('/:id/guardians', async (req, res) => {
  const { rows } = await query(`
    SELECT g.*, sg.relation, sg.is_primary
    FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id
    WHERE sg.student_id = $1 ORDER BY sg.is_primary DESC, g.last_name`, [req.params.id]);
  res.json(rows);
});

/**
 * Link a guardian to a student: pass `guardian_id` to reuse an existing one (e.g. a sibling's parent),
 * or guardian fields to create a new one. Runs in a transaction so a failed link doesn't leave an orphan guardian.
 */
router.post('/:id/guardians', async (req, res) => {
  const { guardian_id, relation = 'guardian', is_primary = false, ...data } = req.body;
  if (!guardian_id && !data.last_name) throw new HttpError(400, 'Missing: guardian_id or last_name');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let gid = guardian_id;
    if (!gid) {
      const cols = GUARDIAN_FIELDS.filter((f) => data[f]);
      const { rows } = await client.query(
        `INSERT INTO guardians (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`,
        cols.map((c) => data[c]));
      gid = rows[0].id;
    }
    // Only one primary guardian per student: demote the current one first
    if (is_primary) await client.query('UPDATE student_guardians SET is_primary = false WHERE student_id = $1', [req.params.id]);
    await client.query(
      'INSERT INTO student_guardians (student_id, guardian_id, relation, is_primary) VALUES ($1, $2, $3, $4)',
      [req.params.id, gid, relation, is_primary]);
    await client.query('COMMIT');
    res.status(201).json({ guardian_id: gid });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

router.delete('/:id/guardians/:guardianId', async (req, res) => {
  await query('DELETE FROM student_guardians WHERE student_id = $1 AND guardian_id = $2', [req.params.id, req.params.guardianId]);
  res.status(204).end();
});

router.get('/:id/report-card', async (req, res) => res.json(await reportCard(req.params.id, req.query.academic_year)));

export default router;
