<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import AppIcon from '../components/AppIcon.vue';
import ExportMenu from '../components/ExportMenu.vue';
import { attendanceApi, classesApi, coursesApi, academicYearsApi, timetableApi } from '../api/http';
import { useAuth } from '../composables/useAuth';
import { exportRows } from '../utils/xlsx';
import { ATTENDANCE_STATUSES, statusLabel, rateTone, shiftDate } from '../config/attendance';
import { today } from '../config/finance';
import { t, fmtNum } from '../i18n';

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
  ...(f.value.class_id ? [{ value: 'student', label: t('attendance.groups.student') }] : [{ value: 'class', label: t('attendance.groups.class') }]),
  { value: 'course', label: t('attendance.groups.course') },
  { value: 'day', label: t('attendance.groups.day') },
  ...(f.value.class_id ? [{ value: 'class', label: t('attendance.groups.total') }] : []),
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
  const d = today();
  if (kind === 'week') { f.value.from = shiftDate(d, -6); f.value.to = d; }
  else if (kind === 'month') { f.value.from = shiftDate(d, -29); f.value.to = d; }
  else { f.value.from = ''; f.value.to = ''; }
}

const groupLabel = computed(() => report.value && t(`attendance.groupLabel.${report.value.group}`));
const extraLabel = computed(() => report.value && t(`attendance.extraLabel.${report.value.group}`));

function exportReport(format) {
  const g = report.value;
  exportRows(format, `attendance-${g.group}${f.value.class_id ? `-${yearClasses.value.find((c) => c.id === f.value.class_id)?.name ?? ''}` : ''}`.replace(/\s+/g, '-'), g.rows, [
    ['label', groupLabel.value], ['extra', extraLabel.value], ['sessions', t('attendance.sessions')], ['marks', t('attendance.marks')],
    ...ATTENDANCE_STATUSES.map((s) => [s.value, s.label]), ['rate', t('attendance.attendancePct')],
  ]);
}

const markOf = (st, col) => (col.session_id ? st.marks[col.session_id] : null);
const SHORT = computed(() => Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s.value, s.short])));
const regAbsent = (st) => Object.values(st.marks).filter((m) => m === 'absent').length;
</script>

<template>
  <section>
    <PageHeader :title="t('attendance.reportsTitle')" :subtitle="schoolWide ? t('attendance.reportsOffice') : t('attendance.reportsTeacher')">
      <ExportMenu v-if="tab === 'summary' && report?.rows.length" @export="exportReport" />
    </PageHeader>

    <div class="tabs-bar">
      <button :class="['tab', { active: tab === 'summary' }]" @click="tab = 'summary'"><AppIcon name="chart" size="16" />{{ t('attendance.summary') }}</button>
      <button :class="['tab', { active: tab === 'register' }]" @click="tab = 'register'"><AppIcon name="grid" size="16" />{{ t('attendance.register') }}</button>
    </div>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>

    <div class="card">
      <div class="toolbar">
        <div class="filters">
          <select v-model="f.academic_year" :aria-label="t('common.academicYear')" @change="f.class_id = ''">
            <option v-for="y in years" :key="y.id" :value="y.name">{{ y.name }}</option>
          </select>
          <select v-model="f.class_id" :aria-label="t('common.class')">
            <option v-if="schoolWide || tab === 'summary'" value="">{{ schoolWide ? t('attendance.wholeSchool') : t('attendance.allMine') }}</option>
            <option v-for="c in yearClasses" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <template v-if="tab === 'summary'">
            <select v-model="f.course_id" :aria-label="t('common.course')">
              <option value="">{{ t('attendance.allCourses') }}</option>
              <option v-for="c in courses" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
            <select v-model="f.group" :aria-label="t('attendance.byX', { x: '' })">
              <option value="">{{ t('attendance.byX', { x: f.class_id ? t('attendance.groups.student') : t('attendance.groups.class') }) }}</option>
              <option v-for="g in GROUPS.slice(1)" :key="g.value" :value="g.value">{{ t('attendance.byX', { x: g.label }) }}</option>
            </select>
          </template>
        </div>
        <div v-if="tab === 'summary'" class="filters">
          <input v-model="f.from" type="date" :aria-label="t('common.from')" />
          <input v-model="f.to" type="date" :aria-label="t('common.to')" />
          <button class="btn secondary sm" @click="period('week')">{{ t('attendance.days7') }}</button>
          <button class="btn secondary sm" @click="period('month')">{{ t('attendance.days30') }}</button>
          <button v-if="f.from || f.to" class="btn secondary sm" @click="period('all')">{{ t('attendance.wholeYear') }}</button>
        </div>
        <div v-else class="filters">
          <div class="date-nav">
            <button class="icon-btn" :title="t('common.previousDay')" @click="regDate = shiftDate(regDate, -1)"><AppIcon name="chevronLeft" /></button>
            <input v-model="regDate" type="date" :aria-label="t('common.date')" />
            <button class="icon-btn" :title="t('common.nextDay')" @click="regDate = shiftDate(regDate, 1)"><AppIcon name="chevronRight" /></button>
          </div>
        </div>
      </div>

      <!-- Summary -->
      <template v-if="tab === 'summary' && report">
        <div class="att-totals in-card">
          <div class="att-total rate" :class="rateTone(report.totals.rate)"><b>{{ report.totals.rate ?? '—' }}<small v-if="report.totals.rate != null">%</small></b><span>{{ t('attendance.rate') }}</span></div>
          <div v-for="s in ATTENDANCE_STATUSES" :key="s.value" :class="['att-total', s.value]"><b>{{ fmtNum(report.totals[s.value]) }}</b><span>{{ s.label }}</span></div>
        </div>
        <div class="table-wrap" :class="{ 'is-loading': loading }">
          <table class="table">
            <thead>
              <tr><th>{{ groupLabel }}</th><th>{{ extraLabel }}</th><th class="num">{{ t('attendance.sessions') }}</th><th v-for="s in ATTENDANCE_STATUSES.slice(1)" :key="s.value" class="num">{{ s.label }}</th><th>{{ t('nav.attendance') }}</th></tr>
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
          <div v-if="!report.rows.length" class="empty"><AppIcon name="inbox" size="32" /><p>{{ t('attendance.noData') }}</p></div>
        </div>
      </template>

      <!-- Day register -->
      <template v-if="tab === 'register'">
        <div v-if="!f.class_id" class="empty"><AppIcon name="classes" size="32" /><p>{{ t('attendance.chooseClass') }}</p></div>
        <div v-else-if="register" class="table-wrap" :class="{ 'is-loading': loading }">
          <table class="table register">
            <thead>
              <tr>
                <th>{{ t('common.student') }}</th>
                <th v-for="c in register.columns" :key="`${c.slot_id}-${c.session_id}`" class="center">
                  <RouterLink v-if="c.slot_id" :to="`/attendance/${c.slot_id}/${register.date}`" class="reg-col">
                    <span class="mono">{{ c.start_time }}</span><span>{{ c.course_code }}</span>
                  </RouterLink>
                  <span v-else class="reg-col"><span class="mono">{{ c.start_time }}</span><span>{{ c.course_code }}</span></span>
                </th>
                <th class="num">{{ t('attendance.absent') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="st in register.students" :key="st.student_id">
                <td><RouterLink :to="`/students/${st.student_id}`" class="strong">{{ st.last_name }} {{ st.first_name }}</RouterLink></td>
                <td v-for="c in register.columns" :key="`${c.slot_id}-${c.session_id}`" class="center">
                  <span v-if="markOf(st, c)" :class="['mark', markOf(st, c)]" :title="statusLabel(markOf(st, c))">{{ SHORT[markOf(st, c)] }}</span>
                  <span v-else class="muted" :title="c.session_id ? t('attendance.notMarked') : t('attendance.notTaken')">·</span>
                </td>
                <td class="num" :class="{ 'text-danger': regAbsent(st) }">{{ regAbsent(st) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="!register.columns.length" class="empty"><AppIcon name="calendar" size="32" /><p>{{ t('attendance.noClassThatDay') }}</p></div>
          <p v-else class="muted small reg-legend">{{ t('attendance.legend') }}</p>
        </div>
      </template>
    </div>
  </section>
</template>
