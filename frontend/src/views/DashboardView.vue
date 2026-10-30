<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import AppIcon from '../components/AppIcon.vue';
import StatusBadge from '../components/StatusBadge.vue';
import LineChart from '../components/charts/LineChart.vue';
import BarChart from '../components/charts/BarChart.vue';
import { http } from '../api/http';
import { money, compact, methodLabel } from '../config/finance';
import { rateTone, longDate } from '../config/attendance';
import { t, fmtDate, fmtNum } from '../i18n';

/**
 * Role-based dashboard: one API call (/api/dashboard) returns only the blocks the role may see,
 * so the page simply shows what it receives. It refreshes every 2 minutes.
 */
const d = ref(null);
const error = ref('');

async function load() {
  try {
    d.value = (await http.get('/dashboard')).data;
    error.value = '';
  } catch (e) {
    error.value = e.message;
  }
}
let timer;
onMounted(() => { load(); timer = setInterval(load, 120000); });
onBeforeUnmount(() => clearInterval(timer));

const isTeacher = computed(() => d.value?.user.role === 'teacher');
const greeting = computed(() => {
  const h = Number(d.value?.now.time.slice(0, 2) ?? 12);
  return t(h < 12 ? 'dashboard.morning' : h < 18 ? 'dashboard.afternoon' : 'dashboard.evening');
});

// ---------- Today strip ----------
const strip = computed(() => {
  const x = d.value;
  if (!x) return [];
  const items = [];
  if (x.today.classes_now != null) items.push({ icon: 'grid', label: t('dashboard.classesNow'), value: x.today.classes_now, to: '/timetable' });
  if (x.attendance) {
    const a = x.attendance.today;
    items.push({ icon: 'userCheck', label: t('dashboard.rollCalls'), value: `${a.taken}/${a.scheduled}`, to: '/attendance', tone: a.missed ? 'danger' : '' });
    items.push({ icon: 'alert', label: t('dashboard.absencesToday'), value: a.absent, to: '/attendance' });
  }
  if (x.takings) items.push({ icon: 'wallet', label: t('dashboard.takings'), value: money(x.takings.total), to: '/finances/payments' });
  if (x.registrations && !isTeacher.value) items.push({ icon: 'registrations', label: t('dashboard.newThisWeek'), value: x.registrations.this_week, to: '/registrations' });
  if (x.today.next_exam) {
    const e = x.today.next_exam;
    items.push({ icon: 'award', label: t('dashboard.examShort', { trimester: e.trimester, number: e.number }), value: e.days === 0 ? t('common.today') : t('dashboard.inDays', e.days), sub: shortDate(e.date) });
  }
  return items;
});

// ---------- KPIs ----------
const trendText = (v, unit = '%') => (v == null ? null : `${v > 0 ? '+' : ''}${v}${unit}`);
const kpis = computed(() => {
  const x = d.value;
  if (!x) return [];
  const list = [];
  if (isTeacher.value) {
    if (x.attendance) list.push({ icon: 'userCheck', label: t('dashboard.kAttendanceMine'), value: x.attendance.rate != null ? `${x.attendance.rate}%` : '—', tone: rateTone(x.attendance.rate), to: '/attendance/reports' });
    if (x.grades) list.push({ icon: 'classes', label: t('dashboard.kClassesTaught'), value: x.grades.length, to: '/timetable' });
    if (x.grades_to_enter) list.push({ icon: 'pencil', label: t('dashboard.kGradeSheets'), value: x.grades_to_enter.items.length, tone: x.grades_to_enter.items.length ? 'warning' : 'success' });
    if (x.attendance) list.push({ icon: 'alert', label: t('dashboard.kAbsencesMine'), value: fmtNum(x.attendance.absences_30) });
    return list;
  }
  if (x.students) list.push({ icon: 'students', label: t('dashboard.kActive'), value: fmtNum(x.students.active), sub: t('dashboard.kRegistered', { n: fmtNum(x.students.registered) }), to: '/students' });
  if (x.attendance) list.push({ icon: 'userCheck', label: t('dashboard.kAttendance'), value: x.attendance.rate != null ? `${x.attendance.rate}%` : '—', tone: rateTone(x.attendance.rate), sub: t('dashboard.kAbsences', { n: fmtNum(x.attendance.absences_30) }), trend: trendText(x.attendance.trend, t('dashboard.pts')), to: '/attendance/reports' });
  if (x.finance) {
    list.push({ icon: 'wallet', label: t('dashboard.kCollected'), value: x.finance.rate != null ? `${x.finance.rate}%` : '—', sub: t('dashboard.kCollectedOf', { collected: compact(x.finance.collected), expected: compact(x.finance.expected) }), progress: x.finance.rate, to: '/finances/reports' });
    list.push({ icon: 'receipt', label: t('dashboard.kOutstanding'), value: `${compact(x.finance.outstanding)}`, unit: 'FCFA', sub: t('dashboard.kReceived30', { n: compact(x.finance.collected_30) }), to: '/finances' });
  }
  return list;
});

// ---------- Charts ----------
// Month names come from Intl in the chosen language ("Sep" / "sept.")
const monthBars = computed(() => (d.value?.finance?.by_month ?? []).map((m) => ({
  label: fmtDate(`${m.month.slice(0, 7)}-01`, { month: 'long', year: 'numeric' }), short: fmtDate(`${m.month.slice(0, 7)}-01`, { month: 'short' }), value: m.amount,
})));
const attendancePoints = computed(() => (d.value?.attendance?.by_day ?? []).map((p) => ({ label: p.date, value: p.rate })));
const shortDate = (iso) => fmtDate(iso, { day: 'numeric', month: 'short' });
// Short axis label: first letter of the level + section ("1ère A" → "1A", "Tle B" → "TB"); the tooltip has the full name
const shortClass = (name) => { const w = name.split(/\s+/); return w.length > 1 ? `${w[0][0]}${w.at(-1)}` : name; };
const gradeBars = computed(() => (d.value?.grades ?? []).map((g) => ({ label: g.name, short: shortClass(g.name), value: g.average, to: `/classes/${g.id}?tab=results` })));
const gradeTone = (it) => (it.value < 10 ? 'bar-danger' : '');

const occupancy = computed(() => (d.value?.occupancy ?? []).map((c) => ({ ...c, pct: Math.min(100, Math.round((c.enrolled / c.capacity) * 100)) })));
const methodTotal = computed(() => d.value?.takings?.total || 1);
const windowLabel = (s) => t(`dashboard.${s.taken ? 'taken' : s.window === 'open' ? 'openNow' : s.window === 'upcoming' ? 'upcoming' : 'notTaken'}`);
// Alert text in the chosen language (the API also sends an English label)
const alertLabel = (a) => t(`dashboard.alerts.${a.kind === 'attendance' && isTeacher.value ? 'attendanceMine' : a.kind}`, { n: 5 });
const windowKey = (s) => (s.taken ? 'taken' : s.window === 'open' ? 'open' : s.window === 'upcoming' ? 'upcoming' : 'missed');
</script>

<template>
  <section class="dash">
    <PageHeader :title="d ? `${greeting}, ${d.user.full_name}` : t('dashboard.title')"
                :subtitle="d ? t('dashboard.subtitle', { date: longDate(d.now.date), role: t(`options.role.${d.user.role}`), year: d.academic_year ?? '—' }) : t('common.loading')">
      <RouterLink v-if="isTeacher" to="/timetable" class="btn secondary"><AppIcon name="grid" />{{ t('dashboard.myTimetable') }}</RouterLink>
      <RouterLink v-if="d?.attendance" to="/attendance" class="btn primary"><AppIcon name="userCheck" />{{ isTeacher ? t('dashboard.takeAttendance') : t('nav.attendance') }}</RouterLink>
      <RouterLink v-else-if="d?.takings" to="/finances" class="btn primary"><AppIcon name="wallet" />{{ t('dashboard.takePayment') }}</RouterLink>
    </PageHeader>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>
    <div v-if="!d && !error" class="card empty">{{ t('common.loading') }}</div>

    <template v-if="d">
      <!-- Today -->
      <div class="card today-strip">
        <div class="today-clock">
          <span class="live-dot" aria-hidden="true" />
          <div><b>{{ d.now.time }}</b><span class="muted small">{{ t('dashboard.schoolTime') }}</span></div>
        </div>
        <component :is="s.to ? 'RouterLink' : 'div'" v-for="s in strip" :key="s.label" :to="s.to" class="today-item" :class="s.tone">
          <AppIcon :name="s.icon" size="18" />
          <div><b>{{ s.value }}</b><span>{{ s.label }}</span><span v-if="s.sub" class="muted small">{{ s.sub }}</span></div>
        </component>
      </div>

      <!-- Alerts -->
      <div v-if="d.alerts.length" class="alerts-row">
        <RouterLink v-for="a in d.alerts" :key="a.kind" :to="a.to" :class="['alert-chip', a.tone]">
          <b>{{ fmtNum(a.count) }}</b>
          <span>{{ alertLabel(a) }}<template v-if="a.amount"> · {{ compact(a.amount) }} FCFA</template></span>
          <AppIcon name="chevronRight" size="14" />
        </RouterLink>
      </div>

      <!-- Key figures -->
      <div class="kpis">
        <component :is="k.to ? 'RouterLink' : 'div'" v-for="k in kpis" :key="k.label" :to="k.to" class="card kpi">
          <div class="kpi-top">
            <span class="stat-icon"><AppIcon :name="k.icon" size="20" /></span>
            <span v-if="k.trend" :class="['trend', k.trend.startsWith('-') ? 'down' : 'up']">{{ k.trend }}</span>
          </div>
          <p class="muted small">{{ k.label }}</p>
          <p class="stat-value" :class="k.tone ? `text-${k.tone}` : ''">{{ k.value }} <small v-if="k.unit">{{ k.unit }}</small></p>
          <div v-if="k.progress != null" class="progress"><span :style="{ width: `${Math.min(100, k.progress)}%` }" /></div>
          <p v-if="k.sub" class="muted small">{{ k.sub }}</p>
        </component>
      </div>

      <!-- Teacher: today's classes and grades to enter -->
      <div v-if="isTeacher" class="grid-2">
        <div class="card">
          <div class="card-header"><h2>{{ t('dashboard.myClasses') }}</h2><RouterLink to="/timetable" class="link">{{ t('dashboard.timetable') }}</RouterLink></div>
          <ul class="list">
            <li v-for="s in d.attendance?.my_day ?? []" :key="s.slot_id">
              <div>
                <p class="strong">{{ s.start_time }}–{{ s.end_time }} · {{ s.class_name }}</p>
                <p class="muted small">{{ s.course_name }}<template v-if="s.room"> · {{ s.room }}</template></p>
              </div>
              <div class="row-actions">
                <StatusBadge :value="windowKey(s)" :label="windowLabel(s)" />
                <RouterLink v-if="s.can_edit" :to="`/attendance/${s.slot_id}/${d.now.date}`" class="btn sm primary">{{ s.taken ? t('common.edit') : t('dashboard.take') }}</RouterLink>
              </div>
            </li>
            <li v-if="!d.attendance?.my_day?.length" class="muted">{{ t('dashboard.noClass') }}</li>
          </ul>
        </div>
        <div class="card">
          <div class="card-header">
            <h2>{{ t('dashboard.gradesToEnter') }}</h2>
            <span v-if="d.grades_to_enter?.exam" class="muted small">{{ t('dashboard.trimesterExam', { trimester: d.grades_to_enter.exam.trimester, number: d.grades_to_enter.exam.number }) }}</span>
          </div>
          <ul class="list">
            <li v-for="g in d.grades_to_enter?.items ?? []" :key="`${g.class_id}-${g.course_id}`">
              <div>
                <p class="strong">{{ g.class_name }} · {{ g.course_name }}</p>
                <div class="progress"><span :style="{ width: `${(g.graded / g.students) * 100}%` }" /></div>
              </div>
              <RouterLink :to="`/classes/${g.class_id}?tab=grades`" class="btn sm secondary">{{ g.graded }}/{{ g.students }}</RouterLink>
            </li>
            <li v-if="!d.grades_to_enter?.items.length" class="muted"><AppIcon name="check" size="16" /> {{ t('dashboard.allComplete') }}</li>
          </ul>
        </div>
      </div>

      <!-- Charts -->
      <div class="grid-2">
        <div v-if="monthBars.length" class="card">
          <div class="card-header"><h2>{{ t('dashboard.tuitionPerMonth') }}</h2><RouterLink to="/finances/reports" class="link">{{ t('dashboard.report') }}</RouterLink></div>
          <div class="card-body"><BarChart :items="monthBars" :format="money" /></div>
        </div>
        <div v-if="attendancePoints.length" class="card">
          <div class="card-header">
            <h2>{{ isTeacher ? t('dashboard.attendanceMineTitle') : t('dashboard.attendanceTitle') }}</h2>
            <span :class="['badge', rateTone(d.attendance.rate)]">{{ d.attendance.rate }}%</span>
          </div>
          <div class="card-body"><LineChart :points="attendancePoints" :format="(v) => `${v}%`" :label-format="shortDate" :target="90" :max="100" /></div>
        </div>
        <div v-if="gradeBars.length" class="card" :class="{ wide: !monthBars.length && !isTeacher }">
          <div class="card-header"><h2>{{ t('dashboard.gradePerClass') }}</h2><span class="muted small">{{ t('dashboard.gradeHint') }}</span></div>
          <div class="card-body"><BarChart :items="gradeBars" :format="(v) => `${v.toFixed(2)} / 20`" :max="20" :target="10" :tone="gradeTone" /></div>
        </div>

        <!-- Attendance watch lists (office) -->
        <div v-if="d.attendance?.lowest_classes?.length && !isTeacher" class="card">
          <div class="card-header"><h2>{{ t('dashboard.toWatch') }}</h2><span class="muted small">{{ t('dashboard.toWatchHint') }}</span></div>
          <ul class="list">
            <li v-for="c in d.attendance.lowest_classes" :key="c.id">
              <RouterLink :to="`/attendance/reports?class_id=${c.id}`" class="strong">{{ c.name }}</RouterLink>
              <div class="rate-cell compact"><div class="rate-bar"><i :class="rateTone(c.rate)" :style="{ width: `${c.rate}%` }" /></div><b>{{ c.rate }}%</b></div>
            </li>
          </ul>
        </div>
        <div v-if="d.attendance?.most_absent?.length" class="card">
          <div class="card-header"><h2>{{ t('dashboard.mostAbsent') }}</h2><span class="muted small">{{ t('dashboard.days30') }}</span></div>
          <ul class="list">
            <li v-for="s in d.attendance.most_absent" :key="s.id">
              <div><RouterLink :to="`/students/${s.id}`" class="strong">{{ s.name }}</RouterLink><p class="muted small mono">{{ s.matricule }}</p></div>
              <span class="badge danger">{{ t('dashboard.absences', s.absent) }}</span>
            </li>
          </ul>
        </div>

        <!-- Money -->
        <div v-if="d.takings" class="card">
          <div class="card-header"><h2>{{ t('dashboard.takings') }}</h2><b>{{ money(d.takings.total) }}</b></div>
          <div class="card-body">
            <div v-for="m in d.takings.by_method" :key="m.method" class="hbar">
              <div class="hbar-text"><span>{{ methodLabel(m.method) }} <span class="muted small">· {{ m.count }}</span></span><b>{{ money(m.total) }}</b></div>
              <div class="progress"><span :style="{ width: `${(m.total / methodTotal) * 100}%` }" /></div>
            </div>
            <p v-if="!d.takings.by_method.length" class="muted">{{ t('dashboard.nothingToday') }}</p>
          </div>
          <ul v-if="d.takings.journal.length" class="list">
            <li v-for="j in d.takings.journal" :key="`${j.kind}-${j.id}`">
              <div><p class="strong">{{ j.who ?? '—' }}</p><p class="muted small mono">{{ j.receipt_number }} · {{ j.kind === 'sale' ? t('dashboard.sale') : t('dashboard.tuition') }}</p></div>
              <b>{{ money(j.amount) }}</b>
            </li>
          </ul>
        </div>
        <div v-if="d.finance?.largest_balances?.length" class="card">
          <div class="card-header"><h2>{{ t('dashboard.largestBalances') }}</h2><RouterLink to="/finances" class="link">{{ t('dashboard.accounts') }}</RouterLink></div>
          <ul class="list">
            <li v-for="b in d.finance.largest_balances" :key="b.registration_id">
              <div><p class="strong">{{ b.student }}</p><p class="muted small">{{ b.class_name }}</p></div>
              <b class="text-danger">{{ money(b.balance) }}</b>
            </li>
          </ul>
        </div>

        <!-- Registrations and classes -->
        <div v-if="d.registrations && !isTeacher" class="card">
          <div class="card-header"><h2>{{ t('dashboard.recentRegistrations') }}</h2><RouterLink to="/registrations" class="link">{{ t('common.viewAll') }}</RouterLink></div>
          <ul class="list">
            <li v-for="r in d.registrations.recent" :key="r.id">
              <div>
                <RouterLink :to="`/students/${r.student_id}`" class="strong">{{ r.student }}</RouterLink>
                <p class="muted small">{{ r.class_name }} · {{ fmtDate(r.registered_at) }}</p>
              </div>
              <StatusBadge :value="r.status"  />
            </li>
          </ul>
        </div>
        <div v-if="occupancy.length" class="card">
          <div class="card-header"><h2>{{ t('dashboard.fillRate') }}</h2><RouterLink to="/classes" class="link">{{ t('nav.classes') }}</RouterLink></div>
          <div class="occ-grid">
            <RouterLink v-for="c in occupancy" :key="c.id" :to="`/classes/${c.id}`" class="occ" :title="`${c.enrolled} / ${c.capacity}`">
              <span class="occ-name">{{ c.name }}</span>
              <div class="progress"><span :style="{ width: `${c.pct}%` }" :class="{ full: c.pct >= 100 }" /></div>
              <span class="muted small">{{ c.enrolled }}/{{ c.capacity }}</span>
            </RouterLink>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
