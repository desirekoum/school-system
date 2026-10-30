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
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
});

// ---------- Today strip ----------
const strip = computed(() => {
  const x = d.value;
  if (!x) return [];
  const items = [];
  if (x.today.classes_now != null) items.push({ icon: 'grid', label: 'Classes now', value: x.today.classes_now, to: '/timetable' });
  if (x.attendance) {
    const t = x.attendance.today;
    items.push({ icon: 'userCheck', label: 'Roll calls today', value: `${t.taken}/${t.scheduled}`, to: '/attendance', tone: t.missed ? 'danger' : '' });
    items.push({ icon: 'alert', label: 'Absences today', value: t.absent, to: '/attendance' });
  }
  if (x.takings) items.push({ icon: 'wallet', label: "Today's takings", value: money(x.takings.total), to: '/finances/payments' });
  if (x.registrations && !isTeacher.value) items.push({ icon: 'registrations', label: 'New this week', value: x.registrations.this_week, to: '/registrations' });
  if (x.today.next_exam) {
    const e = x.today.next_exam;
    items.push({ icon: 'award', label: `Exam T${e.trimester}·${e.number}`, value: e.days === 0 ? 'Today' : `in ${e.days} days`, sub: shortDate(e.date) });
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
    if (x.attendance) list.push({ icon: 'userCheck', label: 'Attendance in my classes (30 d)', value: x.attendance.rate != null ? `${x.attendance.rate}%` : '—', tone: rateTone(x.attendance.rate), to: '/attendance/reports' });
    if (x.grades) list.push({ icon: 'classes', label: 'Classes I teach', value: x.grades.length, to: '/timetable' });
    if (x.grades_to_enter) list.push({ icon: 'pencil', label: 'Grade sheets to complete', value: x.grades_to_enter.items.length, tone: x.grades_to_enter.items.length ? 'warning' : 'success' });
    if (x.attendance) list.push({ icon: 'alert', label: 'Absences in my classes (30 d)', value: x.attendance.absences_30.toLocaleString() });
    return list;
  }
  if (x.students) list.push({ icon: 'students', label: 'Active students', value: x.students.active.toLocaleString(), sub: `${x.students.registered.toLocaleString()} registered this year`, to: '/students' });
  if (x.attendance) list.push({ icon: 'userCheck', label: 'Attendance (30 days)', value: x.attendance.rate != null ? `${x.attendance.rate}%` : '—', tone: rateTone(x.attendance.rate), sub: `${x.attendance.absences_30.toLocaleString()} absences`, trend: trendText(x.attendance.trend, ' pts'), to: '/attendance/reports' });
  if (x.finance) {
    list.push({ icon: 'wallet', label: 'Tuition collected', value: x.finance.rate != null ? `${x.finance.rate}%` : '—', sub: `${compact(x.finance.collected)} of ${compact(x.finance.expected)} FCFA`, progress: x.finance.rate, to: '/finances/reports' });
    list.push({ icon: 'receipt', label: 'Outstanding balance', value: `${compact(x.finance.outstanding)}`, unit: 'FCFA', sub: `${compact(x.finance.collected_30)} FCFA received in the last 30 days`, to: '/finances' });
  }
  return list;
});

// ---------- Charts ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthBars = computed(() => (d.value?.finance?.by_month ?? []).map((m) => ({ label: `${MONTHS[Number(m.month.slice(5)) - 1]} ${m.month.slice(0, 4)}`, short: MONTHS[Number(m.month.slice(5)) - 1], value: m.amount })));
const attendancePoints = computed(() => (d.value?.attendance?.by_day ?? []).map((p) => ({ label: p.date, value: p.rate })));
const shortDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
// Short axis label: first letter of the level + section ("1ère A" → "1A", "Tle B" → "TB"); the tooltip has the full name
const shortClass = (name) => { const w = name.split(/\s+/); return w.length > 1 ? `${w[0][0]}${w.at(-1)}` : name; };
const gradeBars = computed(() => (d.value?.grades ?? []).map((g) => ({ label: g.name, short: shortClass(g.name), value: g.average, to: `/classes/${g.id}?tab=results` })));
const gradeTone = (it) => (it.value < 10 ? 'bar-danger' : '');

const occupancy = computed(() => (d.value?.occupancy ?? []).map((c) => ({ ...c, pct: Math.min(100, Math.round((c.enrolled / c.capacity) * 100)) })));
const methodTotal = computed(() => d.value?.takings?.total || 1);
const windowLabel = (s) => (s.taken ? 'Taken' : s.window === 'open' ? 'Open now' : s.window === 'upcoming' ? 'Upcoming' : 'Not taken');
const windowKey = (s) => (s.taken ? 'taken' : s.window === 'open' ? 'open' : s.window === 'upcoming' ? 'upcoming' : 'missed');
</script>

<template>
  <section class="dash">
    <PageHeader :title="d ? `${greeting}, ${d.user.full_name}` : 'Dashboard'"
                :subtitle="d ? `${longDate(d.now.date)} · ${d.user.role_label} · academic year ${d.academic_year ?? '—'}` : 'Loading…'">
      <RouterLink v-if="isTeacher" to="/timetable" class="btn secondary"><AppIcon name="grid" />My timetable</RouterLink>
      <RouterLink v-if="d?.attendance" to="/attendance" class="btn primary"><AppIcon name="userCheck" />{{ isTeacher ? 'Take attendance' : 'Attendance' }}</RouterLink>
      <RouterLink v-else-if="d?.takings" to="/finances" class="btn primary"><AppIcon name="wallet" />Take a payment</RouterLink>
    </PageHeader>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>
    <div v-if="!d && !error" class="card empty">Loading…</div>

    <template v-if="d">
      <!-- Today -->
      <div class="card today-strip">
        <div class="today-clock">
          <span class="live-dot" aria-hidden="true" />
          <div><b>{{ d.now.time }}</b><span class="muted small">school time</span></div>
        </div>
        <component :is="s.to ? 'RouterLink' : 'div'" v-for="s in strip" :key="s.label" :to="s.to" class="today-item" :class="s.tone">
          <AppIcon :name="s.icon" size="18" />
          <div><b>{{ s.value }}</b><span>{{ s.label }}</span><span v-if="s.sub" class="muted small">{{ s.sub }}</span></div>
        </component>
      </div>

      <!-- Alerts -->
      <div v-if="d.alerts.length" class="alerts-row">
        <RouterLink v-for="a in d.alerts" :key="a.kind" :to="a.to" :class="['alert-chip', a.tone]">
          <b>{{ a.count.toLocaleString() }}</b>
          <span>{{ a.label }}<template v-if="a.amount"> · {{ compact(a.amount) }} FCFA</template></span>
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
          <div class="card-header"><h2>My classes today</h2><RouterLink to="/timetable" class="link">Timetable</RouterLink></div>
          <ul class="list">
            <li v-for="s in d.attendance?.my_day ?? []" :key="s.slot_id">
              <div>
                <p class="strong">{{ s.start_time }}–{{ s.end_time }} · {{ s.class_name }}</p>
                <p class="muted small">{{ s.course_name }}<template v-if="s.room"> · {{ s.room }}</template></p>
              </div>
              <div class="row-actions">
                <StatusBadge :value="windowKey(s)" :label="windowLabel(s)" />
                <RouterLink v-if="s.can_edit" :to="`/attendance/${s.slot_id}/${d.now.date}`" class="btn sm primary">{{ s.taken ? 'Edit' : 'Take' }}</RouterLink>
              </div>
            </li>
            <li v-if="!d.attendance?.my_day?.length" class="muted">No class for you today.</li>
          </ul>
        </div>
        <div class="card">
          <div class="card-header">
            <h2>Grades to enter</h2>
            <span v-if="d.grades_to_enter?.exam" class="muted small">Trimester {{ d.grades_to_enter.exam.trimester }}, exam {{ d.grades_to_enter.exam.number }}</span>
          </div>
          <ul class="list">
            <li v-for="g in d.grades_to_enter?.items ?? []" :key="`${g.class_id}-${g.course_id}`">
              <div>
                <p class="strong">{{ g.class_name }} · {{ g.course_name }}</p>
                <div class="progress"><span :style="{ width: `${(g.graded / g.students) * 100}%` }" /></div>
              </div>
              <RouterLink :to="`/classes/${g.class_id}?tab=grades`" class="btn sm secondary">{{ g.graded }}/{{ g.students }}</RouterLink>
            </li>
            <li v-if="!d.grades_to_enter?.items.length" class="muted"><AppIcon name="check" size="16" /> All grade sheets are complete.</li>
          </ul>
        </div>
      </div>

      <!-- Charts -->
      <div class="grid-2">
        <div v-if="monthBars.length" class="card">
          <div class="card-header"><h2>Tuition received per month</h2><RouterLink to="/finances/reports" class="link">Report</RouterLink></div>
          <div class="card-body"><BarChart :items="monthBars" :format="money" /></div>
        </div>
        <div v-if="attendancePoints.length" class="card">
          <div class="card-header">
            <h2>{{ isTeacher ? 'Attendance in my classes' : 'Attendance' }}, last 30 days</h2>
            <span :class="['badge', rateTone(d.attendance.rate)]">{{ d.attendance.rate }}%</span>
          </div>
          <div class="card-body"><LineChart :points="attendancePoints" :format="(v) => `${v}%`" :label-format="shortDate" :target="90" :max="100" /></div>
        </div>
        <div v-if="gradeBars.length" class="card" :class="{ wide: !monthBars.length && !isTeacher }">
          <div class="card-header"><h2>Average grade per class</h2><span class="muted small">/ 20 · red under 10</span></div>
          <div class="card-body"><BarChart :items="gradeBars" :format="(v) => `${v.toFixed(2)} / 20`" :max="20" :target="10" :tone="gradeTone" /></div>
        </div>

        <!-- Attendance watch lists (office) -->
        <div v-if="d.attendance?.lowest_classes?.length && !isTeacher" class="card">
          <div class="card-header"><h2>Classes to watch</h2><span class="muted small">lowest attendance, 30 days</span></div>
          <ul class="list">
            <li v-for="c in d.attendance.lowest_classes" :key="c.id">
              <RouterLink :to="`/attendance/reports?class_id=${c.id}`" class="strong">{{ c.name }}</RouterLink>
              <div class="rate-cell compact"><div class="rate-bar"><i :class="rateTone(c.rate)" :style="{ width: `${c.rate}%` }" /></div><b>{{ c.rate }}%</b></div>
            </li>
          </ul>
        </div>
        <div v-if="d.attendance?.most_absent?.length" class="card">
          <div class="card-header"><h2>Most absent students</h2><span class="muted small">30 days</span></div>
          <ul class="list">
            <li v-for="s in d.attendance.most_absent" :key="s.id">
              <div><RouterLink :to="`/students/${s.id}`" class="strong">{{ s.name }}</RouterLink><p class="muted small mono">{{ s.matricule }}</p></div>
              <span class="badge danger">{{ s.absent }} absences</span>
            </li>
          </ul>
        </div>

        <!-- Money -->
        <div v-if="d.takings" class="card">
          <div class="card-header"><h2>Today's takings</h2><b>{{ money(d.takings.total) }}</b></div>
          <div class="card-body">
            <div v-for="m in d.takings.by_method" :key="m.method" class="hbar">
              <div class="hbar-text"><span>{{ methodLabel(m.method) }} <span class="muted small">· {{ m.count }}</span></span><b>{{ money(m.total) }}</b></div>
              <div class="progress"><span :style="{ width: `${(m.total / methodTotal) * 100}%` }" /></div>
            </div>
            <p v-if="!d.takings.by_method.length" class="muted">Nothing received yet today.</p>
          </div>
          <ul v-if="d.takings.journal.length" class="list">
            <li v-for="j in d.takings.journal" :key="`${j.kind}-${j.id}`">
              <div><p class="strong">{{ j.who ?? '—' }}</p><p class="muted small mono">{{ j.receipt_number }} · {{ j.kind === 'sale' ? 'Sale' : 'Tuition' }}</p></div>
              <b>{{ money(j.amount) }}</b>
            </li>
          </ul>
        </div>
        <div v-if="d.finance?.largest_balances?.length" class="card">
          <div class="card-header"><h2>Largest balances due</h2><RouterLink to="/finances" class="link">Accounts</RouterLink></div>
          <ul class="list">
            <li v-for="b in d.finance.largest_balances" :key="b.registration_id">
              <div><p class="strong">{{ b.student }}</p><p class="muted small">{{ b.class_name }}</p></div>
              <b class="text-danger">{{ money(b.balance) }}</b>
            </li>
          </ul>
        </div>

        <!-- Registrations and classes -->
        <div v-if="d.registrations && !isTeacher" class="card">
          <div class="card-header"><h2>Recent registrations</h2><RouterLink to="/registrations" class="link">View all</RouterLink></div>
          <ul class="list">
            <li v-for="r in d.registrations.recent" :key="r.id">
              <div>
                <RouterLink :to="`/students/${r.student_id}`" class="strong">{{ r.student }}</RouterLink>
                <p class="muted small">{{ r.class_name }} · {{ new Date(r.registered_at).toLocaleDateString() }}</p>
              </div>
              <StatusBadge :value="r.status" :label="r.status === 'pending' ? 'Awaiting payment' : undefined" />
            </li>
          </ul>
        </div>
        <div v-if="occupancy.length" class="card">
          <div class="card-header"><h2>Class fill rate</h2><RouterLink to="/classes" class="link">Classes</RouterLink></div>
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
