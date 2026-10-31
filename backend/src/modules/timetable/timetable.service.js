import { query } from '../../db/pool.js';
import { HttpError } from '../../middleware/errors.js';
import { tx } from '../finances/finances.service.js';

// The school's clock: "now", today's date and the weekday are read in this time zone, whatever the server's
export const SCHOOL_TZ = process.env.SCHOOL_TZ ?? 'Africa/Douala';

/**
 * Effective teacher of a slot = its own teacher_id (override) or else the course teacher of the class.
 * Times are returned as 'HH:MM'.
 */
export const SLOT_SQL = `
  SELECT ts.id, ts.class_id, ts.course_id, ts.weekday, ts.room,
         to_char(ts.start_time, 'HH24:MI') AS start_time, to_char(ts.end_time, 'HH24:MI') AS end_time,
         ts.teacher_id AS teacher_override, COALESCE(ts.teacher_id, cc.teacher_id) AS teacher_id,
         t.first_name || ' ' || t.last_name AS teacher,
         c.name AS class_name, c.level, c.academic_year, co.code AS course_code, co.name AS course_name
  FROM timetable_slots ts
  JOIN classes c ON c.id = ts.class_id
  JOIN courses co ON co.id = ts.course_id
  JOIN class_courses cc ON cc.class_id = ts.class_id AND cc.course_id = ts.course_id
  LEFT JOIN teachers t ON t.id = COALESCE(ts.teacher_id, cc.teacher_id)`;

const ORDER = 'ORDER BY weekday, start_time, class_name';

/** The school's current date, time and ISO weekday (1 = Monday). */
// Computed with Intl in SCHOOL_TZ: no database time-zone tables needed (MySQL often has none loaded)
export async function schoolNow(at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: SCHOOL_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, time: `${p.hour}:${p.minute}`, weekday: weekdayOf(date) };
}

/** Academic year containing a date (falls back to the current year). */
export async function yearOf(date) {
  const { rows: [y] } = await query(`
    SELECT name, start_date, end_date FROM academic_years
    WHERE ($1::date BETWEEN start_date AND end_date) OR is_current
    ORDER BY ($1::date BETWEEN start_date AND end_date) DESC LIMIT 1`, [date]);
  return y;
}

export const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;

/** Slots of a class, or of a teacher in an academic year (default: current year). */
export async function listSlots({ class_id, teacher_id, academic_year }) {
  if (class_id) return (await query(`SELECT * FROM (${SLOT_SQL}) s WHERE class_id = $1 ${ORDER}`, [class_id])).rows;
  if (!teacher_id) throw new HttpError(400, 'Give class_id or teacher_id');
  const { rows } = await query(`
    SELECT * FROM (${SLOT_SQL}) s
    WHERE teacher_id = $1 AND academic_year = COALESCE($2, (SELECT name FROM academic_years WHERE is_current))
    ${ORDER}`, [teacher_id, academic_year ?? null]);
  return rows;
}

/**
 * What is taught at a given moment (default: now, school time), optionally for one class or teacher.
 * `at` = 'YYYY-MM-DDTHH:MM' read as school time; the academic year is the one containing that date.
 */
export async function slotsAt({ at, class_id, teacher_id }) {
  let date, time;
  if (at) {
    const m = String(at).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
    if (!m) throw new HttpError(400, 'at must look like 2026-10-30T09:15');
    [, date, time] = m;
  } else ({ date, time } = await schoolNow());
  const year = await yearOf(date);
  if (!year) return { date, time, weekday: weekdayOf(date), academic_year: null, slots: [] };
  const { rows } = await query(`
    SELECT * FROM (${SLOT_SQL}) s
    WHERE academic_year = $1 AND weekday = $2 AND start_time <= $3 AND end_time > $3
      AND ($4::int IS NULL OR class_id = $4) AND ($5::int IS NULL OR teacher_id = $5)
    ORDER BY class_name`, [year.name, weekdayOf(date), time, class_id ?? null, teacher_id ?? null]);
  return { date, time, weekday: weekdayOf(date), academic_year: year.name, slots: rows };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function clean(body) {
  const d = {
    class_id: Number(body.class_id), course_id: Number(body.course_id), weekday: Number(body.weekday),
    start_time: String(body.start_time ?? '').slice(0, 5), end_time: String(body.end_time ?? '').slice(0, 5),
    teacher_id: body.teacher_id ? Number(body.teacher_id) : null, room: body.room?.trim() || null,
  };
  if (!d.class_id || !d.course_id) throw new HttpError(400, 'Missing: class_id, course_id');
  if (!(d.weekday >= 1 && d.weekday <= 7)) throw new HttpError(400, 'weekday must be 1 (Monday) to 7 (Sunday)');
  if (!TIME.test(d.start_time) || !TIME.test(d.end_time)) throw new HttpError(400, 'Times must be HH:MM');
  if (d.end_time <= d.start_time) throw new HttpError(400, 'The end time must be after the start time');
  return d;
}

/**
 * No double booking in the same academic year: a class, a teacher or a room can't be in two slots at once.
 * Two slots overlap when each starts before the other ends.
 */
async function checkConflicts(client, d, id = null) {
  const { rows: [cls] } = await client.query('SELECT name, academic_year FROM classes WHERE id = $1 FOR UPDATE', [d.class_id]);
  if (!cls) throw new HttpError(404, 'Class not found');
  const { rows: [cc] } = await client.query('SELECT teacher_id FROM class_courses WHERE class_id = $1 AND course_id = $2', [d.class_id, d.course_id]);
  if (!cc) throw new HttpError(400, 'This course is not taught in this class: add it to the class first');
  const teacher = d.teacher_id ?? cc.teacher_id;

  const { rows } = await client.query(`
    SELECT * FROM (${SLOT_SQL}) s
    WHERE academic_year = $1 AND weekday = $2 AND start_time < $4 AND end_time > $3 AND ($5::int IS NULL OR id <> $5)
      AND (class_id = $6 OR ($7::int IS NOT NULL AND teacher_id = $7) OR ($8::text IS NOT NULL AND lower(room) = lower($8)))
    LIMIT 1`, [cls.academic_year, d.weekday, d.start_time, d.end_time, id, d.class_id, teacher, d.room]);
  const c = rows[0];
  if (!c) return;
  const when = `${c.start_time}–${c.end_time}`;
  if (c.class_id === d.class_id) throw new HttpError(409, `${cls.name} already has ${c.course_name} at ${when}`);
  if (teacher && c.teacher_id === teacher) throw new HttpError(409, `${c.teacher} already teaches ${c.class_name} at ${when}`);
  throw new HttpError(409, `Room ${c.room} is used by ${c.class_name} at ${when}`);
}

const getSlot = async (client, id) => (await client.query(`SELECT * FROM (${SLOT_SQL}) s WHERE id = $1`, [id])).rows[0];

export const createSlot = (body) => tx(async (client) => {
  const d = clean(body);
  await checkConflicts(client, d);
  const { rows: [r] } = await client.query(`
    INSERT INTO timetable_slots (class_id, course_id, teacher_id, weekday, start_time, end_time, room)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [d.class_id, d.course_id, d.teacher_id, d.weekday, d.start_time, d.end_time, d.room]);
  return getSlot(client, r.id);
});

export const updateSlot = (id, body) => tx(async (client) => {
  const d = clean(body);
  await checkConflicts(client, d, Number(id));
  const { rowCount } = await client.query(`
    UPDATE timetable_slots SET class_id = $2, course_id = $3, teacher_id = $4, weekday = $5, start_time = $6, end_time = $7, room = $8
    WHERE id = $1`, [id, d.class_id, d.course_id, d.teacher_id, d.weekday, d.start_time, d.end_time, d.room]);
  if (!rowCount) throw new HttpError(404, 'Slot not found');
  return getSlot(client, id);
});

export async function deleteSlot(id) {
  const { rowCount } = await query('DELETE FROM timetable_slots WHERE id = $1', [id]);
  if (!rowCount) throw new HttpError(404, 'Slot not found');
}
