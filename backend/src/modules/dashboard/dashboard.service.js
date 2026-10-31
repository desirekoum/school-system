import { query } from '../../db/pool.js';
import { monthSeries } from '../../db/series.js';
import { can, ROLES } from '../auth/roles.js';
import { schoolNow } from '../timetable/timetable.service.js';
import { daySessions, summary, CLOSE_AFTER } from '../attendance/attendance.service.js';
import { ACCOUNTS } from '../finances/finances.service.js';

/**
 * One call builds the whole dashboard for the signed-in user.
 * Each block is computed only if the role has the permission behind it, so every role gets its own dashboard
 * and nothing it may not see. Blocks run in parallel (Promise.all) and each is a small aggregate query.
 */
const LOW_STOCK = 5;
const shift = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const pctChange = (now, before) => (before ? Math.round(((now - before) / before) * 1000) / 10 : null);
const one = async (sql, params) => (await query(sql, params)).rows[0];
const all = async (sql, params) => (await query(sql, params)).rows;

export async function dashboard(user) {
  const now = await schoolNow();
  const { rows: [year] } = await query('SELECT name, start_date, end_date FROM academic_years WHERE is_current');
  const ctx = { user, now, year: year?.name, today: now.date, d30: shift(now.date, -29), d60: shift(now.date, -59), d31: shift(now.date, -30) };
  const office = can(user, 'attendance:read');
  const teacher = !!user.teacher_id;
  const blocks = await Promise.all([
    today(ctx),
    can(user, 'students:read') ? studentsKpi(ctx) : null,
    office || can(user, 'attendance:take') ? attendance(ctx, office) : null,
    can(user, 'finance:read') ? finance(ctx) : null,
    can(user, 'payments:write') || can(user, 'sales:write') ? takings(ctx) : null,
    can(user, 'grades:read') ? gradesByClass(ctx) : null,
    teacher && can(user, 'grades:write') ? gradesToEnter(ctx) : null,
    can(user, 'registrations:read') ? registrations(ctx) : null,
    alerts(ctx, office),
    can(user, 'academics:read') && user.role !== 'teacher' ? occupancy(ctx) : null,
  ]);
  const [todayBlock, students, att, fin, take, grades, toGrade, regs, alertList, occ] = blocks;
  return {
    user: { full_name: user.full_name, role: user.role, role_label: ROLES[user.role]?.label ?? user.role },
    academic_year: ctx.year, now, today: todayBlock, students, attendance: att, finance: fin, takings: take,
    grades, grades_to_enter: toGrade, registrations: regs, alerts: alertList, occupancy: occ,
  };
}

// ---------- Today ----------
async function today({ user, now, year }) {
  const out = { date: now.date, time: now.time, weekday: now.weekday };
  if (!year) return out;
  const [live, exam] = await Promise.all([
    can(user, 'academics:read') ? one(`
      SELECT count(*)::int AS n FROM timetable_slots ts JOIN classes c ON c.id = ts.class_id
      WHERE c.academic_year = $1 AND ts.weekday = $2 AND ts.start_time <= $3::time AND ts.end_time > $3::time`, [year, now.weekday, now.time]) : null,
    one(`
      SELECT e.exam_date::text AS date, t.number AS trimester, e.number
      FROM exams e JOIN trimesters t ON t.id = e.trimester_id JOIN academic_years ay ON ay.id = t.academic_year_id
      WHERE ay.name = $1 AND e.exam_date >= $2 ORDER BY e.exam_date LIMIT 1`, [year, now.date]),
  ]);
  out.classes_now = live?.n ?? null;
  out.next_exam = exam ? { ...exam, days: Math.round((Date.parse(exam.date) - Date.parse(now.date)) / 86400000) } : null;
  return out;
}

// ---------- Students ----------
async function studentsKpi({ year, today, d30, d60, d31 }) {
  const r = await one(`
    SELECT (SELECT count(*)::int FROM students WHERE status = 'active') AS active,
           (SELECT count(*)::int FROM registrations WHERE academic_year = $1 AND status <> 'cancelled') AS registered,
           (SELECT count(*)::int FROM registrations WHERE registered_at::date BETWEEN $3 AND $2) AS new_30,
           (SELECT count(*)::int FROM registrations WHERE registered_at::date BETWEEN $4 AND $5) AS new_prev_30,
           (SELECT count(*)::int FROM students WHERE status = 'active' AND gender = 'F') AS girls`, [year, today, d30, d60, d31]);
  return { ...r, trend: pctChange(r.new_30, r.new_prev_30) };
}

// ---------- Attendance (school-wide for the office, own classes for a teacher) ----------
async function attendance({ user, year, today, d30, d60, d31 }, office) {
  const base = { academic_year: year };
  const [last30, prev30, byDay, byStudent, day] = await Promise.all([
    summary({ ...base, group: 'class', from: d30, to: today }, user),
    summary({ ...base, group: 'class', from: d60, to: d31 }, user),
    summary({ ...base, group: 'day', from: d30, to: today }, user),
    office ? summary({ ...base, group: 'student', from: d30, to: today }, user) : null,
    daySessions({ date: today }, user),
  ]);
  const sessions = day.sessions;
  return {
    rate: last30.totals.rate,
    trend: last30.totals.rate != null && prev30.totals.rate != null ? Math.round((last30.totals.rate - prev30.totals.rate) * 10) / 10 : null,
    absences_30: last30.totals.absent,
    today: {
      scheduled: sessions.length,
      taken: sessions.filter((s) => s.session_id).length,
      missed: sessions.filter((s) => !s.session_id && s.window === 'closed').length,
      absent: sessions.reduce((a, s) => a + (s.counts?.absent ?? 0), 0),
    },
    by_day: byDay.rows.map((r) => ({ date: r.label, rate: r.rate })),
    lowest_classes: [...last30.rows].sort((a, b) => a.rate - b.rate).slice(0, 5).map((r) => ({ id: r.key, name: r.label, rate: r.rate, absent: r.absent })),
    most_absent: byStudent ? [...byStudent.rows].sort((a, b) => b.absent - a.absent).slice(0, 5)
      .map((r) => ({ id: r.key, name: r.label, matricule: r.extra, absent: r.absent, rate: r.rate })) : null,
    // A teacher's classes of the day, with the roll-call state and the button to take it
    my_day: !office ? sessions.map((s) => ({
      slot_id: s.id, class_name: s.class_name, course_name: s.course_name, start_time: s.start_time, end_time: s.end_time,
      room: s.room, taken: !!s.session_id, window: s.window, can_edit: s.can_edit,
    })) : null,
  };
}

// ---------- Finance ----------
// Tuition received per month of the academic year, from the first payment (registrations are often paid
// before the school year starts) to today; months with no payment are filled in JS
async function tuitionByMonth(year, today) {
  const [ay, rows] = await Promise.all([
    one('SELECT start_date, end_date FROM academic_years WHERE name = $1', [year]),
    all(`
      SELECT to_char(p.paid_at, 'YYYY-MM') AS month, SUM(p.amount)::int AS amount
      FROM payments p JOIN registrations r ON r.id = p.registration_id
      WHERE p.voided_at IS NULL AND r.academic_year = $1
      GROUP BY 1 ORDER BY 1`, [year]),
  ]);
  if (!ay) return [];
  const byMonth = new Map(rows.map((r) => [r.month, r.amount]));
  const first = [rows[0]?.month, ay.start_date.slice(0, 7)].filter(Boolean).sort()[0];
  const last = (today < ay.end_date ? today : ay.end_date).slice(0, 7);
  return monthSeries(first, last).filter((m) => m <= last).map((month) => ({ month, amount: byMonth.get(month) ?? 0 }));
}
async function finance({ year, today, d30, d60, d31 }) {
  const [totals, months, debtors, last] = await Promise.all([
    one(`
      SELECT COALESCE(SUM(rb.fee), 0)::bigint::float AS expected, COALESCE(SUM(rb.paid), 0)::bigint::float AS collected,
             COALESCE(SUM(rb.balance), 0)::bigint::float AS outstanding
      FROM registrations r JOIN registration_balances rb ON rb.registration_id = r.id
      WHERE r.academic_year = $1 AND r.status <> 'cancelled'`, [year]),
    tuitionByMonth(year, today),
    all(`
      SELECT r.id AS registration_id, s.first_name || ' ' || s.last_name AS student, c.name AS class_name, rb.balance
      FROM registrations r JOIN students s ON s.id = r.student_id JOIN classes c ON c.id = r.class_id
      JOIN registration_balances rb ON rb.registration_id = r.id
      WHERE r.academic_year = $1 AND r.status <> 'cancelled' AND rb.balance > 0
      ORDER BY rb.balance DESC, rb.registration_id LIMIT 5`, [year]),
    one(`
      SELECT COALESCE(SUM(amount) FILTER (WHERE paid_at BETWEEN $2 AND $1), 0)::int AS last_30,
             COALESCE(SUM(amount) FILTER (WHERE paid_at BETWEEN $3 AND $4), 0)::int AS prev_30
      FROM payments WHERE voided_at IS NULL`, [today, d30, d60, d31]),
  ]);
  return {
    ...totals,
    rate: totals.expected ? Math.round((1000 * totals.collected) / totals.expected) / 10 : null,
    collected_30: last.last_30, trend: pctChange(last.last_30, last.prev_30),
    by_month: months, largest_balances: debtors,
  };
}

// ---------- Today's takings (front desk) ----------
async function takings({ today }) {
  const [byMethod, journal] = await Promise.all([
    all(`
      SELECT method, SUM(amount)::int AS total, count(*)::int AS count FROM (
        SELECT method, amount FROM payments WHERE voided_at IS NULL AND paid_at = $1
        UNION ALL
        SELECT s.method, st.total FROM sales s JOIN sale_totals st ON st.sale_id = s.id WHERE s.voided_at IS NULL AND s.sold_at = $1
      ) t GROUP BY method ORDER BY total DESC`, [today]),
    all(`
      (SELECT 'tuition' AS kind, p.id, p.receipt_number, p.amount, p.method, p.created_at, st.first_name || ' ' || st.last_name AS who
       FROM payments p JOIN registrations r ON r.id = p.registration_id JOIN students st ON st.id = r.student_id
       WHERE p.voided_at IS NULL AND p.paid_at = $1)
      UNION ALL
      (SELECT 'sale', s.id, s.receipt_number, t.total, s.method, s.created_at, COALESCE(st.first_name || ' ' || st.last_name, s.buyer_name)
       FROM sales s JOIN sale_totals t ON t.sale_id = s.id LEFT JOIN students st ON st.id = s.student_id
       WHERE s.voided_at IS NULL AND s.sold_at = $1)
      ORDER BY created_at DESC LIMIT 8`, [today]),
  ]);
  return { total: byMethod.reduce((a, m) => a + m.total, 0), by_method: byMethod, journal };
}

// ---------- Grades ----------
async function gradesByClass({ user, year }) {
  // A teacher sees the classes they teach; other roles with grades:read the whole school
  const scoped = user.role === 'teacher';
  const rows = await all(`
    SELECT c.id, c.name, round(avg(g.score), 2)::float AS average, count(DISTINCT g.student_id)::int AS students
    FROM grades g JOIN exams e ON e.id = g.exam_id JOIN trimesters t ON t.id = e.trimester_id
    JOIN academic_years ay ON ay.id = t.academic_year_id
    JOIN registrations r ON r.student_id = g.student_id AND r.academic_year = ay.name
    JOIN classes c ON c.id = r.class_id
    WHERE ay.name = $1 ${scoped ? 'AND c.id IN (SELECT class_id FROM class_courses WHERE teacher_id = $2)' : ''}
    GROUP BY c.id ORDER BY c.name`, scoped ? [year, user.teacher_id ?? 0] : [year]);
  return rows;
}

// For a teacher: their class + course pairs still missing grades for the last exam that has taken place
async function gradesToEnter({ user, year, today }) {
  const exam = await one(`
    SELECT e.id, e.exam_date::text AS date, t.number AS trimester, e.number
    FROM exams e JOIN trimesters t ON t.id = e.trimester_id JOIN academic_years ay ON ay.id = t.academic_year_id
    WHERE ay.name = $1 AND e.exam_date <= $2 ORDER BY e.exam_date DESC LIMIT 1`, [year, today]);
  if (!exam) return { exam: null, items: [] };
  const items = await all(`
    SELECT c.id AS class_id, c.name AS class_name, co.id AS course_id, co.name AS course_name,
           (SELECT count(*)::int FROM registrations r WHERE r.class_id = c.id AND r.status <> 'cancelled') AS students,
           (SELECT count(*)::int FROM grades g JOIN registrations r ON r.student_id = g.student_id AND r.class_id = c.id
            WHERE g.exam_id = $3 AND g.course_id = co.id) AS graded
    FROM class_courses cc JOIN classes c ON c.id = cc.class_id JOIN courses co ON co.id = cc.course_id
    WHERE cc.teacher_id = $1 AND c.academic_year = $2
    ORDER BY c.name, co.name`, [user.teacher_id, year, exam.id]);
  return { exam, items: items.filter((i) => i.graded < i.students) };
}

// ---------- Registrations ----------
async function registrations({ year, today }) {
  const [counts, recent] = await Promise.all([
    one(`
      SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending,
             count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
             count(*) FILTER (WHERE registered_at::date > $2::date - interval '7 days')::int AS this_week
      FROM registrations WHERE academic_year = $1`, [year, today]),
    all(`
      SELECT r.id, r.student_id, r.status, r.registered_at, s.first_name || ' ' || s.last_name AS student, c.name AS class_name
      FROM registrations r JOIN students s ON s.id = r.student_id JOIN classes c ON c.id = r.class_id
      ORDER BY r.registered_at DESC, r.id DESC LIMIT 6`),
  ]);
  return { ...counts, recent };
}

// ---------- Class fill rate ----------
const occupancy = ({ year }) => all(`
  SELECT c.id, c.name, c.capacity,
         (SELECT count(*)::int FROM registrations r WHERE r.class_id = c.id AND r.status <> 'cancelled') AS enrolled
  FROM classes c WHERE c.academic_year = $1 ORDER BY c.name`, [year]);

// ---------- Alerts: what needs someone's attention, each with a link ----------
async function alerts({ user, now, year, today }, office) {
  const list = [];
  const add = (count, a) => count > 0 && list.push({ count, ...a });
  const jobs = [];
  if (year && (office || can(user, 'attendance:take'))) {
    jobs.push(one(`
      SELECT count(*)::int AS n FROM timetable_slots ts JOIN classes c ON c.id = ts.class_id
      LEFT JOIN class_courses cc ON cc.class_id = ts.class_id AND cc.course_id = ts.course_id
      WHERE c.academic_year = $1 AND ts.weekday = $2 AND ts.end_time + make_interval(mins => $4) < $3::time
        AND NOT EXISTS (SELECT 1 FROM attendance_sessions a WHERE a.slot_id = ts.id AND a.date = $5)
        AND ($6::int IS NULL OR COALESCE(ts.teacher_id, cc.teacher_id) = $6)`,
    [year, now.weekday, now.time, CLOSE_AFTER, today, office ? null : (user.teacher_id ?? 0)])
      .then((r) => add(r.n, { kind: 'attendance', tone: 'danger', label: office ? 'roll calls not taken today' : 'of your roll calls were not taken today', to: '/attendance' })));
  }
  if (year && can(user, 'finance:read')) {
    // Same overdue rule as the tuition accounts page (ACCOUNTS.is_overdue)
    jobs.push(one(`
      SELECT count(*)::int AS n, COALESCE(SUM(overdue), 0)::bigint::float AS amount
      FROM (${ACCOUNTS.baseSql}) a WHERE a.academic_year = $1 AND a.status <> 'cancelled' AND a.is_overdue`, [year])
      .then((r) => add(r.n, { kind: 'overdue', tone: 'danger', label: 'students behind on their instalments', amount: r.amount, to: '/finances' })));
  }
  if (can(user, 'plans:approve')) {
    jobs.push(one("SELECT count(*)::int AS n FROM instalment_plans WHERE status = 'requested'")
      .then((r) => add(r.n, { kind: 'plans', tone: 'warning', label: 'instalment plans waiting for approval', to: '/finances' })));
  }
  if (can(user, 'items:read')) {
    jobs.push(one('SELECT count(*)::int AS n FROM items WHERE is_active AND stock IS NOT NULL AND stock <= $1', [LOW_STOCK])
      .then((r) => add(r.n, { kind: 'stock', tone: 'warning', label: `items with ${LOW_STOCK} or fewer left in stock`, to: '/finances/items' })));
  }
  if (year && can(user, 'registrations:write')) {
    jobs.push(one("SELECT count(*)::int AS n FROM registrations WHERE academic_year = $1 AND status = 'pending'", [year])
      .then((r) => add(r.n, { kind: 'registrations', tone: 'info', label: 'registrations awaiting payment', to: '/registrations' })));
  }
  await Promise.all(jobs);
  // The queries finish in any order: most urgent first, then a fixed order
  const rank = { danger: 0, warning: 1, info: 2 };
  return list.sort((a, b) => (rank[a.tone] ?? 3) - (rank[b.tone] ?? 3) || a.kind.localeCompare(b.kind));
}
