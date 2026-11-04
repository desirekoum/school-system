import { query } from '../../db/pool.js';
import { HttpError } from '../../middleware/errors.js';
import { tx, syncStatus } from '../finances/finances.service.js';
import { registerIn } from '../registrations/registrations.service.js';
import { classResults, PASS_MARK } from '../grades/grades.service.js';

/**
 * End-of-year promotion: every student of a class is registered for the next academic year,
 * in the next level if their year average is at least PASS_MARK, in the same level otherwise.
 * The principal or the office can override each decision (class council) before applying.
 *
 * A student is never "moved": a new registration is created for the new year,
 * so last year's class, grades and report cards stay as they were.
 */

// French secondary system, in order. A level not in the list can only repeat or leave.
export const LEVELS = ['6e', '5e', '4e', '3e', '2nde', '1ère', 'Tle'];
export const DECISIONS = ['promote', 'repeat', 'leave'];

const nextLevel = (level) => {
  const i = LEVELS.indexOf(level);
  return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1] : null; // null after Tle: the student graduates
};
// Section letter: "6e A" → "A", so 6e A goes to 5e A by default
const section = (name, level) => name.slice(level.length).trim();

async function loadClass(classId) {
  const { rows: [cls] } = await query('SELECT * FROM classes WHERE id = $1', [classId]);
  if (!cls) throw new HttpError(404, 'Class not found');
  return cls;
}

/** The academic year that follows `name` (by start date), or the one asked for. */
async function targetYear(cls, toYear) {
  const { rows: [from] } = await query('SELECT * FROM academic_years WHERE name = $1', [cls.academic_year]);
  const { rows } = await query('SELECT name, start_date FROM academic_years WHERE start_date > $1 ORDER BY start_date', [from?.end_date ?? '1900-01-01']);
  if (toYear && !rows.some((y) => y.name === toYear)) throw new HttpError(400, `${toYear} is not an academic year after ${cls.academic_year}`);
  return { years: rows.map((y) => y.name), year: toYear ?? rows[0]?.name ?? null };
}

/**
 * Preview: each student's year average and rank, the proposed decision and target class,
 * plus the classes of the next year they can go to. Nothing is written.
 */
export async function promotionPreview(classId, toYear) {
  const cls = await loadClass(classId);
  const { years, year } = await targetYear(cls, toYear);
  const next = nextLevel(cls.level);
  const results = await classResults(classId, null);

  let classes = [];
  let already = new Map();
  if (year) {
    ({ rows: classes } = await query(`
      SELECT c.id, c.name, c.level, c.capacity, c.tuition_fee,
             (SELECT count(*)::int FROM registrations r WHERE r.class_id = c.id AND r.status <> 'cancelled') AS enrolled
      FROM classes c WHERE c.academic_year = $1 AND c.level IN ($2, $3) ORDER BY c.name`, [year, cls.level, next ?? cls.level]));
    const ids = results.students.map((s) => s.id);
    const { rows: regs } = await query(`
      SELECT r.student_id, c.name AS class_name FROM registrations r JOIN classes c ON c.id = r.class_id
      WHERE r.academic_year = $1 AND r.student_id = ANY($2::int[])`, [year, ids]);
    already = new Map(regs.map((r) => [r.student_id, r.class_name]));
  }
  const promoteTo = classes.filter((c) => c.level === next);
  const repeatIn = classes.filter((c) => c.level === cls.level);
  const sameSection = (list) => list.find((c) => section(c.name, c.level) === section(cls.name, cls.level))?.id ?? list[0]?.id ?? null;

  const students = results.students.map((s) => {
    const passed = s.general_avg !== null && s.general_avg >= PASS_MARK;
    const decision = passed ? (next ? 'promote' : 'leave') : 'repeat';
    return {
      id: s.id, matricule: s.matricule, first_name: s.first_name, last_name: s.last_name, photo_url: s.photo_url,
      year_avg: s.general_avg, rank: s.rank, passed,
      decision,
      class_id: decision === 'promote' ? sameSection(promoteTo) : decision === 'repeat' ? sameSection(repeatIn) : null,
      already_in: already.get(s.id) ?? null,
    };
  }).sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name) || a.id - b.id);

  return {
    class: cls, pass_mark: PASS_MARK, next_level: next,
    years, academic_year: year,
    targets: { promote: promoteTo, repeat: repeatIn },
    students,
  };
}

/**
 * Applies the decisions in ONE transaction: either every student is registered, or none is
 * (a full class or a bad target rolls everything back, with the student's name in the error).
 * `decisions`: [{ student_id, decision: 'promote'|'repeat'|'leave', class_id }].
 * Students already registered for the target year are skipped.
 */
export async function applyPromotion(classId, { academic_year, decisions = [] }) {
  const preview = await promotionPreview(classId, academic_year);
  if (!preview.academic_year) throw new HttpError(409, 'Create the next academic year and its classes first');
  const byId = new Map(preview.students.map((s) => [s.id, s]));
  const allowed = { promote: new Set(preview.targets.promote.map((c) => c.id)), repeat: new Set(preview.targets.repeat.map((c) => c.id)) };

  const todo = [];
  for (const d of decisions) {
    const s = byId.get(Number(d.student_id));
    if (!s) throw new HttpError(400, `Student ${d.student_id} is not in ${preview.class.name}`);
    if (!DECISIONS.includes(d.decision)) throw new HttpError(400, `decision must be one of ${DECISIONS.join(', ')}`);
    if (s.already_in || d.decision === 'leave') continue;
    if (d.decision === 'promote' && !preview.next_level) throw new HttpError(400, `${preview.class.level} is the last level: ${s.first_name} ${s.last_name} can only repeat or leave`);
    const classId = Number(d.class_id);
    if (!allowed[d.decision].has(classId)) {
      throw new HttpError(400, `${s.first_name} ${s.last_name}: choose a ${d.decision === 'promote' ? preview.next_level : preview.class.level} class of ${preview.academic_year}`);
    }
    todo.push({ s, classId, decision: d.decision });
  }

  const counts = { promoted: 0, repeating: 0 };
  await tx(async (client) => {
    for (const { s, classId, decision } of todo) {
      try {
        const reg = await registerIn(client, { student_id: s.id, class_id: classId });
        await syncStatus(client, reg.id);
      } catch (e) {
        if (e.status) throw new HttpError(e.status, `${s.first_name} ${s.last_name}: ${e.message}`);
        throw e;
      }
      counts[decision === 'promote' ? 'promoted' : 'repeating']++;
    }
  });
  return {
    academic_year: preview.academic_year,
    ...counts,
    leaving: decisions.filter((d) => d.decision === 'leave').length,
    skipped: preview.students.filter((s) => s.already_in).length,
  };
}
