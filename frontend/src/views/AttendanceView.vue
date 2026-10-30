<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import AppIcon from '../components/AppIcon.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { attendanceApi, classesApi } from '../api/http';
import { useAuth } from '../composables/useAuth';
import { longDate, shiftDate } from '../config/attendance';
import { t } from '../i18n';

/**
 * The classes of a day and whether attendance was taken.
 * Teachers see their own classes; the button is active while the class happens.
 * The school office sees every class and can record or correct any past day.
 */
const { can } = useAuth();
const route = useRoute();
const router = useRouter();
const office = computed(() => can('attendance:read') || can('attendance:manage'));

const date = ref(typeof route.query.date === 'string' ? route.query.date : '');
const classId = ref(route.query.class_id ? Number(route.query.class_id) : '');
const day = ref(null);
const classes = ref([]);
const loading = ref(false);
const error = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    day.value = await attendanceApi.day({ date: date.value || undefined, class_id: classId.value || undefined });
    if (!date.value) date.value = day.value.date;
    router.replace({ query: { ...(date.value !== day.value.now.date && { date: date.value }), ...(classId.value && { class_id: classId.value }) } });
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
onMounted(async () => {
  await load();
  if (office.value) classes.value = (await classesApi.list({ academic_year: day.value?.academic_year })).filter((c) => c.academic_year === day.value?.academic_year);
});
watch([date, classId], ([d], [old]) => old !== '' || d !== day.value?.date ? load() : null);

const isToday = computed(() => day.value && date.value === day.value.now.date);

// One status per session: taken (with absences), open now, upcoming, or missed
function state(s) {
  if (s.session_id) return { key: 'taken', label: t('attendance.taken') };
  if (s.window === 'open') return { key: 'open', label: t('attendance.openNow') };
  if (s.window === 'upcoming') return { key: 'upcoming', label: t('attendance.upcoming') };
  return { key: 'missed', label: t('attendance.notTaken') };
}
const counts = (s) => s.counts ?? {};
const action = (s) => {
  if (s.can_edit) return s.session_id ? t('common.edit') : t('attendance.takeAttendance');
  return s.can_view ? t('attendance.view') : null;
};

const stats = computed(() => {
  const list = day.value?.sessions ?? [];
  const taken = list.filter((s) => s.session_id);
  return {
    total: list.length,
    taken: taken.length,
    missed: list.filter((s) => !s.session_id && s.window === 'closed').length,
    absent: taken.reduce((a, s) => a + (counts(s).absent ?? 0), 0),
  };
});
</script>

<template>
  <section>
    <PageHeader :title="t('attendance.title')" :subtitle="office ? t('attendance.subtitleOffice') : t('attendance.subtitleTeacher')">
      <RouterLink to="/attendance/reports" class="btn secondary"><AppIcon name="chart" />{{ t('attendance.reports') }}</RouterLink>
    </PageHeader>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>

    <div class="card">
      <div class="toolbar">
        <div class="date-nav">
          <button class="icon-btn" :title="t('common.previousDay')" @click="date = shiftDate(date, -1)"><AppIcon name="chevronLeft" /></button>
          <input v-model="date" type="date" :aria-label="t('common.date')" />
          <button class="icon-btn" :title="t('common.nextDay')" @click="date = shiftDate(date, 1)"><AppIcon name="chevronRight" /></button>
          <button v-if="!isToday && day" class="btn secondary sm" @click="date = day.now.date">{{ t('common.today') }}</button>
        </div>
        <select v-if="office" v-model="classId" :aria-label="t('common.class')">
          <option value="">{{ t('attendance.allClasses') }}</option>
          <option v-for="c in classes" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>

      <div v-if="day" class="day-summary">
        <div>
          <p class="strong">{{ longDate(day.date) }}<span v-if="isToday" class="pill" style="margin-left: .5rem">{{ t('attendance.todayAt', { time: day.now.time }) }}</span></p>
          <p v-if="day.outside_year" class="muted small">{{ t('attendance.outsideYear', { year: day.academic_year }) }}</p>
        </div>
        <div class="mini-stats">
          <span>{{ t('attendance.takenOf', { taken: stats.taken, total: stats.total }) }}</span>
          <span v-if="stats.missed" class="text-danger">{{ t('attendance.notTakenN', { n: stats.missed }) }}</span>
          <span>{{ t('attendance.absencesN', { n: stats.absent }) }}</span>
        </div>
      </div>

      <div class="table-wrap" :class="{ 'is-loading': loading }">
        <table class="table">
          <thead><tr><th>{{ t('common.time') }}</th><th>{{ t('common.class') }}</th><th>{{ t('common.course') }}</th><th v-if="office">{{ t('common.teacher') }}</th><th>{{ t('attendance.rollCall') }}</th><th class="right">{{ t('attendance.action') }}</th></tr></thead>
          <tbody>
            <tr v-for="s in day?.sessions ?? []" :key="s.id" :class="{ 'row-live': s.window === 'open' && isToday }">
              <td class="mono nowrap">{{ s.start_time }}–{{ s.end_time }}</td>
              <td class="strong">{{ s.class_name }}</td>
              <td>{{ s.course_name }}</td>
              <td v-if="office">{{ s.teacher ?? '—' }}</td>
              <td>
                <StatusBadge :value="state(s).key" :label="state(s).label" />
                <span v-if="s.session_id" class="muted small att-counts">
                  {{ t('attendance.absentN', { n: counts(s).absent ?? 0 }) }}<template v-if="counts(s).late"> · {{ t('attendance.lateN', { n: counts(s).late }) }}</template> / {{ s.students }}
                </span>
              </td>
              <td class="right">
                <RouterLink v-if="action(s)" :to="`/attendance/${s.id}/${day.date}`" class="btn sm" :class="s.can_edit && !s.session_id ? 'primary' : 'secondary'">
                  <AppIcon :name="s.can_edit ? 'userCheck' : 'chevronRight'" size="14" />{{ action(s) }}
                </RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="day && !day.sessions.length" class="empty">
          <AppIcon name="calendar" size="32" />
          <p>{{ t(isToday ? 'attendance.noClassToday' : 'attendance.noClassDay') }}{{ office ? '' : t('attendance.forYou') }}.</p>
          <RouterLink to="/timetable" class="btn secondary">{{ t('attendance.seeTimetable') }}</RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>
