import { crudRouter } from '../crud.js';
import { query } from '../../db/pool.js';
import { HttpError } from '../../middleware/errors.js';

const router = crudRouter({
  table: 'classes',
  fields: ['name', 'level', 'academic_year', 'capacity', 'homeroom_teacher_id'],
  required: ['name', 'level', 'academic_year'],
  // LEFT JOIN keeps classes without a homeroom teacher; subquery counts confirmed students
  listSql: `
    SELECT c.*, t.first_name || ' ' || t.last_name AS homeroom_teacher,
           (SELECT count(*)::int FROM registrations r WHERE r.class_id = c.id AND r.status = 'confirmed') AS enrolled
    FROM classes c LEFT JOIN teachers t ON t.id = c.homeroom_teacher_id
    ORDER BY c.academic_year DESC, c.name`,
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

// Students registered in a class
router.get('/:id/students', async (req, res) => {
  const { rows } = await query(`
    SELECT s.*, r.status, r.id AS registration_id
    FROM registrations r JOIN students s ON s.id = r.student_id
    WHERE r.class_id = $1 ORDER BY s.last_name, s.first_name`, [req.params.id]);
  res.json(rows);
});

export default router;
