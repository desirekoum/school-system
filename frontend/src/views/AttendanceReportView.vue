<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import AppIcon from '../components/AppIcon.vue';
import ExportMenu from '../components/ExportMenu.vue';
import { attendanceApi, classesApi, coursesApi, academicYearsApi, timetableApi } from '../api/http';
import { useAuth } from '../composables/useAuth';
import { exportRows } from '../utils/xlsx';
import { ATTENDANCE_STATUSES, rateTone, shiftDate } from '../config/attendance';
import { today } from '../config/finance';

/**
 * Attendance reports: totals for the whole school, a class or a course, grouped by class, student, course or day.
 * Teachers only get the classes they teach (the API enforces it). "Day register" = one class, one day, every session.
 */
const { can } = useAuth();
const route = useRoute();
const router = useRouter();
const schoolWide = computed(() => can('attendance:read'));

const tab = ref(route.query.tab === 'register' ? 'register' : 'summary');
const years = ref([]);
const classes = ref([]);
const courses = ref([]);
const f = ref({ academic_year: '', class_id: '', course_id: '', from: '', to: '', group: '' });
const report = ref(null);
const register = ref(null);
const regDate = ref(today());
const loading = ref(false);
const error = ref('');

const GROUPS = computed(() => [
  ...(f.value.class_id ? [{ value: 'student', label: 'Students' }] : [{ value: 'class', label: 'Classes' }]),
  { value: 'course', label: 'Courses' },
  { value: 'day', label: 'Days' },
  ...(f.value.class_id ? [{ value: 'class', label: 'Class total' }] : []),
]);

onMounted(async () => {
  const [y, c, co] = await Promise.all([academicYearsApi.list(), classesApi.list(), coursesApi.list()]);
  years.value = y;
  f.value.academic_year = y.find((x) => x.is_current)?.name ?? y[0]?.name ?? '';
  let list = c;
  // A teacher picks among the classes they teach (their timetable); the API refuses the others anyway
  if (!schoolWide.value) {
    const mine = new Set((await timetableApi.list({ mine: 1 })).map((s) => s.class_id));
    list = c.filter((x) => mine.has(x.id));
  }
  classes.value = list;
  courses.value = co;
  if (route.query.class_id) f.value.class_id = Number(route.query.class_id);
  else if (!schoolWide.value && list.length) f.value.class_id = list.find((x) => x.academic_year === f.value.academic_year)?.id ?? '';
  await load();
});

const yearClasses = computed(() => classes.value.filter((c) => c.academic_year === f.value.academic_year));

async function load() {
  error.value = '';
  loading.value = true;
  try {
    if (tab.value === 'summary') {
      const params = Object.fromEntries(Object.entries(f.value).filter(([, v]) => v !== ''));
      report.value = await attendanceApi.report(params);
    } else if (f.value.class_id) {
      register.value = await attendanceApi.register({ class_id: f.value.class_id, date: regDate.value });
    } else register.value = null;
    router.replace({ query: { ...(tab.value === 'register' && { tab: 'register' }), ...(f.value.class_id && { class_id: f.value.class_id }) } });
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
watch(() => f.value.class_id, () => { f.value.group = ''; });
watch([f, tab, regDate], () => years.value.length && load(), { deep: true });

// Quick periods
function period(kind) {
  const t = today();
  if (kind === 'week') { f.value.from = shiftDate(t, -6); f.value.to = t; }
  else if (kind === 'month') { f.value.from = shiftDate(t, -29); f.value.to = t; }
  else { f.value.from = ''; f.value.to = ''; }
}

const groupLabel = computed(() => ({ student: 'Student', class: 'Class', course: 'Course', day: 'Day' })[report.value?.group]);
const extraLabel = computed(() => ({ student: 'Matricule', class: 'Level', course: 'Code', day: 'Weekday' })[report.value?.group]);

function exportReport(format) {
  const g = report.value;
  exportRows(format, `attendance-${g.group}${f.value.class_id ? `-${yearClasses.value.find((c) => c.id === f.value.class_id)?.name ?? ''}` : ''}`.replace(/\s+/g, '-'), g.rows, [
    ['label', groupLabel.value], ['extra', extraLabel.value], ['sessions', 'Sessions'], ['marks', 'Marks'],
    ['present', 'Present'], ['absent', 'Absent'], ['late', 'Late'], ['excused', 'Excused'], ['rate', 'Attendance %'],
  ]);
}

const markOf = (st, col) => (col.session_id ? st.marks[col.session_id] : null);
const SHORT = Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s.value, s.short]));
const regAbsent = (st) => Object.values(st.marks).filter((m) => m === 'absent').length;
</script>

<template>
  <section>
    <PageHeader title="Attendance reports" :subtitle="schoolWide ? 'Attendance of the school, a class or a course, over any period.' : 'Attendance of the classes you teach.'">
      <ExportMenu v-if="tab === 'summary' && report?.rows.length" @export="exportReport" />
    </PageHeader>

    <div class="tabs-bar">
      <button :class="['tab', { active: tab === 'summary' }]" @click="tab = 'summary'"><AppIcon name="chart" size="16" />Summary</button>
      <button :class="['tab', { active: tab === 'register' }]" @click="tab = 'register'"><AppIcon name="grid" size="16" />Day register</button>
    </div>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>

    <div class="card">
      <div class="toolbar">
        <div class="filters">
          <select v-model="f.academic_year" aria-label="Academic year" @change="f.class_id = ''">
            <option v-for="y in years" :key="y.id" :value="y.name">{{ y.name }}</option>
          </select>
          <select v-model="f.class_id" aria-label="Class">
            <option v-if="schoolWide || tab === 'summary'" value="">{{ schoolWide ? 'Whole school' : 'All my classes' }}</option>
            <option v-for="c in yearClasses" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <template v-if="tab === 'summary'">
            <select v-model="f.course_id" aria-label="Course">
              <option value="">All courses</option>
              <option v-for="c in courses" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
            <select v-model="f.group" aria-label="Group by">
              <option value="">By {{ f.class_id ? 'student' : 'class' }}</option>
              <option v-for="g in GROUPS.slice(1)" :key="g.value" :value="g.value">By {{ g.label.toLowerCase() }}</option>
            </select>
          </template>
        </div>
        <div v-if="tab === 'summary'" class="filters">
          <input v-model="f.from" type="date" aria-label="From" />
          <input v-model="f.to" type="date" aria-label="To" />
          <button class="btn secondary sm" @click="period('week')">7 days</button>
          <button class="btn secondary sm" @click="period('month')">30 days</button>
          <button v-if="f.from || f.to" class="btn secondary sm" @click="period('all')">Whole year</button>
        </div>
        <div v-else class="filters">
          <div class="date-nav">
            <button class="icon-btn" title="Previous day" @click="regDate = shiftDate(regDate, -1)"><AppIcon name="chevronLeft" /></button>
            <input v-model="regDate" type="date" aria-label="Date" />
            <button class="icon-btn" title="Next day" @click="regDate = shiftDate(regDate, 1)"><AppIcon name="chevronRight" /></button>
          </div>
        </div>
      </div>

      <!-- Summary -->
      <template v-if="tab === 'summary' && report">
        <div class="att-totals in-card">
          <div class="att-total rate" :class="rateTone(report.totals.rate)"><b>{{ report.totals.rate ?? '—' }}<small v-if="report.totals.rate != null">%</small></b><span>Attendance rate</span></div>
          <div v-for="s in ATTENDANCE_STATUSES" :key="s.value" :class="['att-total', s.value]"><b>{{ report.totals[s.value].toLocaleString() }}</b><span>{{ s.label }}</span></div>
        </div>
        <div class="table-wrap" :class="{ 'is-loading': loading }">
          <table class="table">
            <thead>
              <tr><th>{{ groupLabel }}</th><th>{{ extraLabel }}</th><th class="num">Sessions</th><th class="num">Absent</th><th class="num">Late</th><th class="num">Excused</th><th>Attendance</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in report.rows" :key="r.key">
                <td class="strong">
                  <RouterLink v-if="report.group === 'student'" :to="`/students/${r.key}`">{{ r.label }}</RouterLink>
                  <a v-else-if="report.group === 'class'" href="#" @click.prevent="f.class_id = r.key">{{ r.label }}</a>
                  <template v-else>{{ r.label }}</template>
                </td>
                <td class="muted">{{ r.extra }}</td>
                <td class="num">{{ r.sessions }}</td>
                <td class="num" :class="{ 'text-danger': r.absent }">{{ r.absent }}</td>
                <td class="num">{{ r.late }}</td>
                <td class="num">{{ r.excused }}</td>
                <td>
                  <div class="rate-cell">
                    <div class="rate-bar"><i :class="rateTone(r.rate)" :style="{ width: `${r.rate}%` }" /></div>
                    <b>{{ r.rate }}%</b>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="!report.rows.length" class="empty"><AppIcon name="inbox" size="32" /><p>No attendance recorded for this selection.</p></div>
        </div>
      </template>

      <!-- Day register -->
      <template v-if="tab === 'register'">
        <div v-if="!f.class_id" class="empty"><AppIcon name="classes" size="32" /><p>Choose a class.</p></div>
        <div v-else-if="register" class="table-wrap" :class="{ 'is-loading': loading }">
          <table class="table register">
            <thead>
              <tr>
                <th>Student</th>
                <th v-for="c in register.columns" :key="`${c.slot_id}-${c.session_id}`" class="center">
                  <RouterLink v-if="c.slot_id" :to="`/attendance/${c.slot_id}/${register.date}`" class="reg-col">
                    <span class="mono">{{ c.start_time }}</span><span>{{ c.course_code }}</span>
                  </RouterLink>
                  <span v-else class="reg-col"><span class="mono">{{ c.start_time }}</span><span>{{ c.course_code }}</span></span>
                </th>
                <th class="num">Absent</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="st in register.students" :key="st.student_id">
                <td><RouterLink :to="`/students/${st.student_id}`" class="strong">{{ st.last_name }} {{ st.first_name }}</RouterLink></td>
                <td v-for="c in register.columns" :key="`${c.slot_id}-${c.session_id}`" class="center">
                  <span v-if="markOf(st, c)" :class="['mark', markOf(st, c)]" :title="markOf(st, c)">{{ SHORT[markOf(st, c)] }}</span>
                  <span v-else class="muted" :title="c.session_id ? 'Not marked' : 'Not taken'">·</span>
                </td>
                <td class="num" :class="{ 'text-danger': regAbsent(st) }">{{ regAbsent(st) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="!register.columns.length" class="empty"><AppIcon name="calendar" size="32" /><p>No class scheduled that day.</p></div>
          <p v-else class="muted small reg-legend">P present · A absent · L late · E excused · “·” not taken yet</p>
        </div>
      </template>
    </div>
  </section>
</template>
