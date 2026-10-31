import { query, valuesList } from '../../db/pool.js';
import { HttpError } from '../../middleware/errors.js';
import { can } from '../auth/roles.js';
import { tx } from '../finances/finances.service.js';
import { SLOT_SQL, schoolNow, yearOf, weekdayOf } from '../timetable/timetable.service.js';

/**
 * Attendance is taken per timetable slot and date (a "session").
 * - A teacher takes it for their own slots, while the class is happening: from OPEN_BEFORE minutes before
 *   the start until CLOSE_AFTER minutes after the end, on that day.
 * - attendance:manage (school office) records or corrects any session of a past or current date.
 * - attendance:read sees every report; a teacher only the classes they teach (or are homeroom teacher of).
 */
export const OPEN_BEFORE = 15;
export const CLOSE_AFTER = 60;
export const STATUSES = ['present', 'absent', 'late', 'excused'];

const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const isManager = (user) => can(user, 'attendance:manage');
const seesAll = (user) => can(user, 'attendance:read');

// Classes a teacher teaches: a course in it, a slot in it (override), or homeroom
const TEACHER_CLASSES = `
  SELECT class_id FROM class_courses WHERE teacher_id = $T
  UNION SELECT class_id FROM timetable_slots WHERE teacher_id = $T
  UNION SELECT id FROM classes WHERE homeroom_teacher_id = $T`;
const teacherClasses = (param) => TEACHER_CLASSES.replaceAll('$T', param);

async function assertClassInScope(user, classId) {
  if (seesAll(user)) return;
  const { rowCount } = await query(`SELECT 1 FROM (${teacherClasses('$1')}) x WHERE class_id = $2`, [user.teacher_id ?? 0, classId]);
  if (!rowCount) throw new HttpError(403, 'You can only see the attendance of the classes you teach');
}

/** Is the attendance window of this slot open right now? (teachers only) */
function windowState(slot, date, now) {
  if (date !== now.date) return date < now.date ? 'closed' : 'upcoming';
  const t = minutes(now.time);
  if (t < minutes(slot.start_time) - OPEN_BEFORE) return 'upcoming';
  if (t > minutes(slot.end_time) + CLOSE_AFTER) return 'closed';
  return 'open';
}

function checkDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || Number.isNaN(Date.parse(date))) throw new HttpError(400, 'date must be YYYY-MM-DD');
}

/**
 * Sessions of a day: every slot scheduled that weekday (classes of the year containing the date), with its
 * attendance if taken. A teacher without attendance:read only gets their own slots.
 */
export async function daySessions({ date, class_id }, user) {
  const now = await schoolNow();
  date = date || now.date;
  checkDate(date);
  const year = await yearOf(date);
  if (!year) return { date, now, academic_year: null, sessions: [] };
  const own = !seesAll(user) && !isManager(user);
  const { rows } = await query(`
    SELECT s.*, a.id AS session_id, a.taken_at, a.updated_at,
           (SELECT count(*)::int FROM registrations r WHERE r.class_id = s.class_id AND r.status <> 'cancelled') AS students,
           (SELECT json_object_agg(status, n) FROM (SELECT ar.status, count(*)::int AS n FROM attendance_records ar WHERE ar.session_id = a.id GROUP BY ar.status) x) AS counts
    FROM (${SLOT_SQL}) s
    LEFT JOIN attendance_sessions a ON a.slot_id = s.id AND a.date = $2
    WHERE s.academic_year = $1 AND s.weekday = $3
      AND ($4::int IS NULL OR s.class_id = $4) AND ($5::int IS NULL OR s.teacher_id = $5)
    ORDER BY s.start_time, s.class_name, s.id`,
    [year.name, date, weekdayOf(date), class_id || null, own ? (user.teacher_id ?? 0) : null]);
  const outsideYear = date < year.start_date || date > year.end_date;
  return {
    date, now, academic_year: year.name, outside_year: outsideYear,
    sessions: rows.map((s) => ({ ...s, ...access(s, date, now, user) })),
  };
}

/** What the user may do with one slot on one date: { window, can_edit, can_view }. */
function access(slot, date, now, user) {
  const window = windowState(slot, date, now);
  const mine = user.teacher_id && slot.teacher_id === user.teacher_id && can(user, 'attendance:take');
  const can_edit = (isManager(user) && date <= now.date) || (mine && window === 'open');
  return { window, mine: !!mine, can_edit, can_view: can_edit || mine || seesAll(user) || isManager(user) };
}

async function loadSlot(slotId, date) {
  checkDate(date);
  const { rows: [slot] } = await query(`SELECT * FROM (${SLOT_SQL}) s WHERE id = $1`, [slotId]);
  if (!slot) throw new HttpError(404, 'Timetable slot not found');
  if (slot.weekday !== weekdayOf(date)) throw new HttpError(400, `${slot.course_name} in ${slot.class_name} is not scheduled on that day`);
  return slot;
}

// Students of the class on that date: registered (not cancelled) on or before it
const ROSTER = `
  SELECT s.id AS student_id, s.matricule, s.first_name, s.last_name, s.photo_url
  FROM registrations r JOIN students s ON s.id = r.student_id
  WHERE r.class_id = $1 AND r.status <> 'cancelled'
  ORDER BY s.last_name, s.first_name, s.id`;

/** The call sheet of one slot on one date: students with their mark (none yet = not taken). */
export async function getSheet(slotId, date, user) {
  const slot = await loadSlot(slotId, date);
  const now = await schoolNow();
  const rights = access(slot, date, now, user);
  if (!rights.can_view) await assertClassInScope(user, slot.class_id);
  const { rows: [session] } = await query(`
    SELECT a.id, a.taken_at, a.updated_at, u.full_name AS taken_by
    FROM attendance_sessions a LEFT JOIN users u ON u.id = a.taken_by
    WHERE a.slot_id = $1 AND a.date = $2`, [slotId, date]);
  const { rows: students } = await query(`
    SELECT ro.*, ar.status, ar.minutes_late, ar.note
    FROM (${ROSTER}) ro LEFT JOIN attendance_records ar ON ar.student_id = ro.student_id AND ar.session_id = $2
    ORDER BY ro.last_name, ro.first_name, ro.student_id`,
  [slot.class_id, session?.id ?? 0]);
  return { slot, date, session: session ?? null, students, ...rights, open_before: OPEN_BEFORE, close_after: CLOSE_AFTER };
}

/** Saves the whole call sheet (every student of the class gets a status). */
export async function saveSheet(slotId, date, { records }, user) {
  const slot = await loadSlot(slotId, date);
  const now = await schoolNow();
  const { can_edit, mine, window } = access(slot, date, now, user);
  if (!can_edit) {
    if (date > now.date) throw new HttpError(400, 'Attendance cannot be taken in advance');
    if (mine) throw new HttpError(403, window === 'upcoming'
      ? `Attendance opens ${OPEN_BEFORE} minutes before the class starts (${slot.start_time})`
      : `Attendance closed ${CLOSE_AFTER} minutes after the class ended: ask the school office to correct it`);
    throw new HttpError(403, 'You can only take attendance for your own classes, while they happen');
  }
  if (!Array.isArray(records) || !records.length) throw new HttpError(400, 'records must be a non-empty list');

  return tx(async (client) => {
    const { rows: roster } = await client.query(ROSTER, [slot.class_id]);
    const ids = new Set(roster.map((r) => r.student_id));
    const given = new Map();
    for (const r of records) {
      const id = Number(r.student_id);
      if (!ids.has(id)) throw new HttpError(400, `Student ${r.student_id} is not in ${slot.class_name}`);
      if (!STATUSES.includes(r.status)) throw new HttpError(400, `status must be one of: ${STATUSES.join(', ')}`);
      const late = r.status === 'late' && r.minutes_late ? Number(r.minutes_late) : null;
      if (late !== null && !(Number.isInteger(late) && late > 0 && late < 600)) throw new HttpError(400, 'minutes_late must be a positive whole number');
      given.set(id, { status: r.status, minutes_late: late, note: r.note?.trim().slice(0, 200) || null });
    }
    const missing = roster.filter((r) => !given.has(r.student_id));
    if (missing.length) throw new HttpError(400, `Give a status for every student (${missing.length} missing, e.g. ${missing[0].last_name} ${missing[0].first_name})`);

    // Upsert the session (slot + date are unique), then replace its marks
    await client.query(`
      INSERT INTO attendance_sessions (slot_id, class_id, course_id, teacher_id, date, start_time, end_time, taken_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (slot_id, date) DO UPDATE SET updated_at = now(), taken_by = EXCLUDED.taken_by`,
    [slot.id, slot.class_id, slot.course_id, slot.teacher_id, date, slot.start_time, slot.end_time, user.id]);
    const { rows: [session] } = await client.query('SELECT id FROM attendance_sessions WHERE slot_id = $1 AND date = $2', [slot.id, date]);
    await client.query('DELETE FROM attendance_records WHERE session_id = $1', [session.id]);
    const list = [...given];
    // One multi-row INSERT instead of one query per student
    const marks = valuesList(list.map(([id, v]) => [session.id, id, v.status, v.minutes_late, v.note]));
    await client.query(`INSERT INTO attendance_records (session_id, student_id, status, minutes_late, note) VALUES ${marks.sql}`, marks.params);
    return { session_id: session.id, saved: list.length };
  });
}

// ---------- Reports ----------

const GROUPS = {
  student: { key: 'ar.student_id', label: `st.last_name || ' ' || st.first_name`, extra: 'st.matricule', order: 'label' },
  class: { key: 'a.class_id', label: 'c.name', extra: 'c.level', order: 'label' },
  course: { key: 'a.course_id', label: 'co.name', extra: 'co.code', order: 'label' },
  day: { key: 'a.date', label: `to_char(a.date, 'YYYY-MM-DD')`, extra: `to_char(a.date, 'FMDay')`, order: 'key' },
};

/**
 * Attendance totals grouped by student, class, course or day, over a period.
 * Scope: one class and/or one course, or the whole school. A teacher is limited to the classes they teach.
 * rate = attended (present + late) / marks, in %.
 */
export async function summary(q, user) {
  const group = GROUPS[q.group] ? q.group : q.class_id ? 'student' : 'class';
  const g = GROUPS[group];
  if (q.class_id) await assertClassInScope(user, q.class_id);
  for (const d of [q.from, q.to]) if (d) checkDate(d);
  const year = q.academic_year || (await query('SELECT name FROM academic_years WHERE is_current')).rows[0]?.name;
  const params = [year, q.class_id || null, q.course_id || null, q.from || null, q.to || null];
  let scope = '';
  if (!seesAll(user)) { params.push(user.teacher_id ?? 0); scope = `AND a.class_id IN (${teacherClasses(`$${params.length}`)})`; }

  const { rows } = await query(`
    SELECT ${g.key} AS key, ${g.label} AS label, ${g.extra} AS extra,
           count(DISTINCT a.id)::int AS sessions, count(*)::int AS marks,
           count(*) FILTER (WHERE ar.status = 'present')::int AS present,
           count(*) FILTER (WHERE ar.status = 'absent')::int AS absent,
           count(*) FILTER (WHERE ar.status = 'late')::int AS late,
           count(*) FILTER (WHERE ar.status = 'excused')::int AS excused,
           round(100.0 * count(*) FILTER (WHERE ar.status IN ('present', 'late')) / count(*), 1)::float AS rate
    FROM attendance_records ar
    JOIN attendance_sessions a ON a.id = ar.session_id
    JOIN classes c ON c.id = a.class_id
    JOIN courses co ON co.id = a.course_id
    JOIN students st ON st.id = ar.student_id
    WHERE c.academic_year = $1 AND ($2::int IS NULL OR a.class_id = $2) AND ($3::int IS NULL OR a.course_id = $3)
      AND ($4::date IS NULL OR a.date >= $4) AND ($5::date IS NULL OR a.date <= $5) ${scope}
    GROUP BY 1, 2, 3
    ORDER BY ${g.order === 'key' ? '1' : '2'}`, params);

  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const marks = sum('marks');
  const totals = { marks, present: sum('present'), absent: sum('absent'), late: sum('late'), excused: sum('excused') };
  totals.rate = marks ? Math.round((1000 * (totals.present + totals.late)) / marks) / 10 : null;
  return { group, academic_year: year, rows, totals };
}

/** Day register of a class: its sessions that day (columns) and each student's mark (rows). */
export async function dayRegister({ class_id, date }, user) {
  if (!class_id) throw new HttpError(400, 'Missing: class_id');
  checkDate(date);
  await assertClassInScope(user, class_id);
  const { rows: slots } = await query(`
    SELECT s.id AS slot_id, s.course_name, s.course_code, s.teacher, s.start_time, s.end_time, a.id AS session_id
    FROM (${SLOT_SQL}) s LEFT JOIN attendance_sessions a ON a.slot_id = s.id AND a.date = $2
    WHERE s.class_id = $1 AND s.weekday = $3
    ORDER BY s.start_time`, [class_id, date, weekdayOf(date)]);
  // Sessions of that day whose slot was since deleted are still shown
  const { rows: orphans } = await query(`
    SELECT NULL AS slot_id, co.name AS course_name, co.code AS course_code, t.first_name || ' ' || t.last_name AS teacher,
           to_char(a.start_time, 'HH24:MI') AS start_time, to_char(a.end_time, 'HH24:MI') AS end_time, a.id AS session_id
    FROM attendance_sessions a JOIN courses co ON co.id = a.course_id LEFT JOIN teachers t ON t.id = a.teacher_id
    WHERE a.class_id = $1 AND a.date = $2 AND a.slot_id IS NULL`, [class_id, date]);
  const columns = [...slots, ...orphans].sort((x, y) => x.start_time.localeCompare(y.start_time));
  const { rows: students } = await query(`
    SELECT ro.*, (
      SELECT json_object_agg(ar.session_id, ar.status) FROM attendance_records ar
      JOIN attendance_sessions a ON a.id = ar.session_id
      WHERE ar.student_id = ro.student_id AND a.class_id = $1 AND a.date = $2) AS marks
    FROM (${ROSTER}) ro
    ORDER BY ro.last_name, ro.first_name, ro.student_id`, [class_id, date]);
  students.forEach((s) => { s.marks ??= {}; });
  return { class_id: Number(class_id), date, columns, students };
}

/** A student's attendance over the year: totals and the list of absences and late arrivals. */
export async function studentAttendance(studentId, { academic_year }, user) {
  const year = academic_year || (await query('SELECT name FROM academic_years WHERE is_current')).rows[0]?.name;
  const { rows: [reg] } = await query('SELECT class_id FROM registrations WHERE student_id = $1 AND academic_year = $2', [studentId, year]);
  if (reg) await assertClassInScope(user, reg.class_id);
  else if (!seesAll(user)) throw new HttpError(403, 'You can only see the attendance of the classes you teach');
  const { rows } = await query(`
    SELECT to_char(a.date, 'YYYY-MM-DD') AS date, to_char(a.start_time, 'HH24:MI') AS start_time, co.name AS course_name,
           ar.status, ar.minutes_late, ar.note
    FROM attendance_records ar JOIN attendance_sessions a ON a.id = ar.session_id
    JOIN classes c ON c.id = a.class_id JOIN courses co ON co.id = a.course_id
    WHERE ar.student_id = $1 AND c.academic_year = $2
    ORDER BY a.date DESC, a.start_time DESC`, [studentId, year]);
  const count = (s) => rows.filter((r) => r.status === s).length;
  const totals = { marks: rows.length, present: count('present'), absent: count('absent'), late: count('late'), excused: count('excused') };
  totals.rate = rows.length ? Math.round((1000 * (totals.present + totals.late)) / rows.length) / 10 : null;
  return { academic_year: year, totals, events: rows.filter((r) => r.status !== 'present') };
}
