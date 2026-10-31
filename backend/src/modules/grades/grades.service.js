import { pool, query, valuesList } from '../../db/pool.js';
import { HttpError } from '../../middleware/errors.js';

export const PASS_MARK = 10; // out of 20

// Students counted in a class: every registration that isn't cancelled
const ROSTER = `
  SELECT s.id, s.matricule, s.first_name, s.last_name, s.photo_url
  FROM registrations r JOIN students s ON s.id = r.student_id
  WHERE r.class_id = $1 AND r.status <> 'cancelled'`;

async function getClass(classId) {
  const { rows } = await query('SELECT * FROM classes WHERE id = $1', [classId]);
  if (!rows[0]) throw new HttpError(404, 'Class not found');
  return rows[0];
}

/** The exam must belong to the class's academic year. */
async function checkExam(cls, examId) {
  const { rows } = await query(`
    SELECT e.id, e.number, t.number AS trimester
    FROM exams e JOIN trimesters t ON t.id = e.trimester_id JOIN academic_years ay ON ay.id = t.academic_year_id
    WHERE e.id = $1 AND ay.name = $2`, [examId, cls.academic_year]);
  if (!rows[0]) throw new HttpError(400, `Exam ${examId} is not part of academic year ${cls.academic_year}`);
  return rows[0];
}

async function checkCourse(classId, courseId) {
  const { rowCount } = await query('SELECT 1 FROM class_courses WHERE class_id = $1 AND course_id = $2', [classId, courseId]);
  if (!rowCount) throw new HttpError(400, 'This course is not taught in this class');
}

/** Roster of the class with each student's score for one exam + course. */
export async function getGradebook(classId, { exam_id, course_id }) {
  if (!exam_id || !course_id) throw new HttpError(400, 'Missing: exam_id, course_id');
  const cls = await getClass(classId);
  await checkExam(cls, exam_id);
  await checkCourse(classId, course_id);
  const { rows } = await query(`
    SELECT ro.*, g.score::float AS score, g.comment
    FROM (${ROSTER}) ro
    LEFT JOIN grades g ON g.student_id = ro.id AND g.exam_id = $2 AND g.course_id = $3
    ORDER BY ro.last_name, ro.first_name, ro.id`, [classId, exam_id, course_id]);
  return rows;
}

/**
 * Saves a whole column of grades at once. A null/empty score deletes the grade.
 * Bulk upsert: arrays are sent as 3 parameters and expanded by unnest(), so 60 grades = 1 statement.
 */
export async function saveGradebook(classId, { exam_id, course_id, grades = [] }) {
  if (!exam_id || !course_id) throw new HttpError(400, 'Missing: exam_id, course_id');
  const cls = await getClass(classId);
  await checkExam(cls, exam_id);
  await checkCourse(classId, course_id);

  const roster = new Set((await query(ROSTER, [classId])).rows.map((r) => r.id));
  const toSave = [];
  const toDelete = [];
  for (const g of grades) {
    if (!roster.has(Number(g.student_id))) throw new HttpError(400, `Student ${g.student_id} is not in this class`);
    if (g.score === null || g.score === '' || g.score === undefined) { toDelete.push(g.student_id); continue; }
    const score = Number(g.score);
    if (!Number.isFinite(score) || score < 0 || score > 20) throw new HttpError(400, `Invalid score ${g.score}: must be between 0 and 20`);
    toSave.push({ student_id: g.student_id, score, comment: g.comment || null });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (toSave.length) {
      const rows = valuesList(toSave.map((g) => [exam_id, classId, course_id, g.student_id, g.score, g.comment]));
      await client.query(`
        INSERT INTO grades (exam_id, class_id, course_id, student_id, score, comment) VALUES ${rows.sql}
        ON CONFLICT (exam_id, course_id, student_id)
        DO UPDATE SET score = EXCLUDED.score, comment = EXCLUDED.comment, class_id = EXCLUDED.class_id, updated_at = now()`, rows.params);
    }
    if (toDelete.length) {
      await client.query('DELETE FROM grades WHERE exam_id = $1 AND course_id = $2 AND student_id = ANY($3::int[])',
        [exam_id, course_id, toDelete]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { saved: toSave.length, deleted: toDelete.length };
}

/**
 * Results of a class for a trimester (1-3) or the whole year (trimester = null):
 * - course average = mean of the student's exam scores in that course over the period
 * - general average = course averages weighted by course coefficient
 * - rank = RANK() window function over the general average (ties share a rank: 1, 2, 2, 4)
 */
export async function classResults(classId, trimester = null) {
  const cls = await getClass(classId);
  const { rows: courses } = await query(`
    SELECT co.id, co.code, co.name, co.coefficient::float AS coefficient
    FROM class_courses cc JOIN courses co ON co.id = cc.course_id
    WHERE cc.class_id = $1 ORDER BY co.coefficient DESC, co.name`, [classId]);

  const { rows: students } = await query(`
    WITH period_exams AS (
      SELECT e.id FROM exams e
      JOIN trimesters t ON t.id = e.trimester_id
      JOIN academic_years ay ON ay.id = t.academic_year_id
      WHERE ay.name = $2 AND ($3::int IS NULL OR t.number = $3)
    ),
    course_avgs AS (
      SELECT g.student_id, g.course_id, AVG(g.score) AS avg
      FROM grades g
      WHERE g.class_id = $1 AND g.exam_id IN (SELECT id FROM period_exams)
      GROUP BY g.student_id, g.course_id
    ),
    general AS (
      SELECT ca.student_id, SUM(ca.avg * co.coefficient) / SUM(co.coefficient) AS avg
      FROM course_avgs ca JOIN courses co ON co.id = ca.course_id
      GROUP BY ca.student_id
    )
    SELECT ro.*, round(g.avg, 2)::float AS general_avg,
      CASE WHEN g.avg IS NOT NULL THEN RANK() OVER (ORDER BY g.avg DESC NULLS LAST) END::int AS rank,
      (SELECT json_object_agg(ca.course_id, round(ca.avg, 2)) FROM course_avgs ca WHERE ca.student_id = ro.id) AS course_avgs
    FROM (${ROSTER}) ro
    LEFT JOIN general g ON g.student_id = ro.id
    ORDER BY g.avg DESC NULLS LAST, ro.last_name, ro.first_name`, [classId, cls.academic_year, trimester]);

  students.forEach((s) => { s.course_avgs ??= {}; });
  const graded = students.filter((s) => s.general_avg !== null).map((s) => s.general_avg);
  const stats = {
    students: students.length,
    graded: graded.length,
    average: graded.length ? Math.round((graded.reduce((a, b) => a + b, 0) / graded.length) * 100) / 100 : null,
    highest: graded.length ? Math.max(...graded) : null,
    lowest: graded.length ? Math.min(...graded) : null,
    pass_rate: graded.length ? Math.round((graded.filter((a) => a >= PASS_MARK).length / graded.length) * 1000) / 10 : null,
  };
  return { class: cls, trimester, courses, students, stats };
}

/** Report card of a student for one academic year: every exam score, course and general averages, rank. */
export async function reportCard(studentId, yearName) {
  const { rows: [student] } = await query('SELECT id, matricule, first_name, last_name, photo_url FROM students WHERE id = $1', [studentId]);
  if (!student) throw new HttpError(404, 'Student not found');

  // Default: the current year if the student is registered in it, else their latest registration
  const { rows: regs } = await query(`
    SELECT r.academic_year, r.class_id, c.name AS class_name, ay.is_current
    FROM registrations r JOIN classes c ON c.id = r.class_id JOIN academic_years ay ON ay.name = r.academic_year
    WHERE r.student_id = $1 AND r.status <> 'cancelled'
    ORDER BY ay.is_current DESC, r.academic_year DESC`, [studentId]);
  const reg = yearName ? regs.find((r) => r.academic_year === yearName) : regs[0];
  if (!reg) return { student, years: regs.map((r) => r.academic_year), registration: null };

  const { rows: exams } = await query(`
    SELECT e.id, e.number, t.number AS trimester
    FROM exams e JOIN trimesters t ON t.id = e.trimester_id JOIN academic_years ay ON ay.id = t.academic_year_id
    WHERE ay.name = $1 ORDER BY t.number, e.number`, [reg.academic_year]);

  const { rows: grades } = await query(
    'SELECT exam_id, course_id, score::float AS score FROM grades WHERE student_id = $1 AND class_id = $2', [studentId, reg.class_id]);

  // Class results per period give the averages and the rank in one place
  const periods = await Promise.all([1, 2, 3, null].map((t) => classResults(reg.class_id, t)));
  const mine = periods.map((p) => p.students.find((s) => s.id === Number(studentId)) ?? {});
  const courses = periods[3].courses.map((c) => ({
    ...c,
    scores: Object.fromEntries(grades.filter((g) => g.course_id === c.id).map((g) => [g.exam_id, g.score])),
    trimester_avgs: [0, 1, 2].map((i) => mine[i].course_avgs?.[c.id] ?? null),
    year_avg: mine[3].course_avgs?.[c.id] ?? null,
  }));

  return {
    student,
    years: regs.map((r) => r.academic_year),
    registration: reg,
    exams,
    courses,
    summary: [0, 1, 2, 3].map((i) => ({
      period: i < 3 ? `T${i + 1}` : 'year',
      general_avg: mine[i].general_avg ?? null,
      rank: mine[i].rank ?? null,
      class_size: periods[i].stats.students,
      class_average: periods[i].stats.average,
    })),
  };
}
