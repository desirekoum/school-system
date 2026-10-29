import { crudRouter } from '../crud.js';
import { query } from '../../db/pool.js';
import { HttpError } from '../../middleware/errors.js';
import { paginatedList } from '../../db/paginate.js';
import { tx, syncStatus } from '../finances/finances.service.js';
import { getGradebook, saveGradebook, classResults } from '../grades/grades.service.js';

/**
 * A new class fee also applies to registrations of the class that have no payment and no plan yet.
 * Once a student has paid something or has a plan, their fee is frozen.
 */
async function applyFeeToUnpaid(cls) {
  const { rows } = await query(`
    UPDATE registrations r SET tuition_fee = $2
    WHERE r.class_id = $1 AND r.tuition_fee <> $2
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.registration_id = r.id AND p.voided_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM instalment_plans ip WHERE ip.registration_id = r.id)
    RETURNING r.id`, [cls.id, cls.tuition_fee]);
  await tx(async (client) => { for (const r of rows) await syncStatus(client, r.id); });
}

const router = crudRouter({
  table: 'classes',
  fields: ['name', 'level', 'academic_year', 'capacity', 'homeroom_teacher_id', 'tuition_fee'],
  required: ['name', 'level', 'academic_year'],
  // LEFT JOIN keeps classes without a homeroom teacher; subquery counts confirmed students
  listSql: `
    SELECT c.*, t.first_name || ' ' || t.last_name AS homeroom_teacher,
           (SELECT count(*)::int FROM registrations r WHERE r.class_id = c.id AND r.status = 'confirmed') AS enrolled
    FROM classes c LEFT JOIN teachers t ON t.id = c.homeroom_teacher_id`,
  orderBy: 'academic_year DESC, name',
  searchColumns: ['name', 'level', 'academic_year', 'homeroom_teacher'],
  filters: ['level', 'academic_year'],
  afterUpdate: applyFeeToUnpaid,
});

// Courses taught in a class
router.get('/:id/courses', async (req, res) => {
  const { rows } = await query(`
    SELECT co.*, cc.teacher_id, t.first_name || ' ' || t.last_name AS teacher
    FROM class_courses cc
    JOIN courses co ON co.id = cc.course_id
    LEFT JOIN teachers t ON t.id = cc.teacher_id
    WHERE cc.class_id = $1 ORDER BY co.name`, [req.params.id]);
  res.json(rows);
});

// Assign (or reassign) a course + teacher to a class — UPSERT via ON CONFLICT
router.post('/:id/courses', async (req, res) => {
  const { course_id, teacher_id = null } = req.body;
  if (!course_id) throw new HttpError(400, 'Missing: course_id');
  const { rows } = await query(`
    INSERT INTO class_courses (class_id, course_id, teacher_id) VALUES ($1, $2, $3)
    ON CONFLICT (class_id, course_id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id
    RETURNING *`, [req.params.id, course_id, teacher_id]);
  res.status(201).json(rows[0]);
});

router.delete('/:id/courses/:courseId', async (req, res) => {
  await query('DELETE FROM class_courses WHERE class_id = $1 AND course_id = $2', [req.params.id, req.params.courseId]);
  res.status(204).end();
});

// Students registered in a class (paginated when ?page is given)
const ROSTER_SQL = `
  SELECT s.*, r.status AS registration_status, r.id AS registration_id
  FROM registrations r JOIN students s ON s.id = r.student_id
  WHERE r.class_id = $1`;

router.get('/:id/students', async (req, res) => {
  if (req.query.page !== undefined) {
    return res.json(await paginatedList(req.query, {
      baseSql: ROSTER_SQL, baseParams: [req.params.id], orderBy: 'last_name, first_name',
      searchColumns: ['matricule', 'first_name', 'last_name'], filters: ['registration_status'],
    }));
  }
  const { rows } = await query(`${ROSTER_SQL} ORDER BY s.last_name, s.first_name`, [req.params.id]);
  res.json(rows);
});

// Grade entry for one exam + course (GET roster with scores, PUT the whole column)
router.get('/:id/gradebook', async (req, res) => res.json(await getGradebook(req.params.id, req.query)));
router.put('/:id/gradebook', async (req, res) => {
  // A teacher account may only grade the courses it teaches (row-level check on top of grades:write)
  if (req.user.role === 'teacher') {
    const { rowCount } = await query('SELECT 1 FROM class_courses WHERE class_id = $1 AND course_id = $2 AND teacher_id = $3',
      [req.params.id, req.body.course_id, req.user.teacher_id]);
    if (!rowCount) throw new HttpError(403, 'You can only enter grades for the courses you teach');
  }
  res.json(await saveGradebook(req.params.id, req.body));
});

// Averages and ranks: ?trimester=1|2|3, or nothing for the whole year
router.get('/:id/results', async (req, res) => {
  const t = req.query.trimester ? Number(req.query.trimester) : null;
  if (t !== null && ![1, 2, 3].includes(t)) throw new HttpError(400, 'trimester must be 1, 2 or 3');
  res.json(await classResults(req.params.id, t));
});

export default router;
