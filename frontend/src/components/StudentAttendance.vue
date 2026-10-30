<script setup>
import { ref, onMounted } from 'vue';
import AppIcon from './AppIcon.vue';
import StatusBadge from './StatusBadge.vue';
import { attendanceApi } from '../api/http';
import { ATTENDANCE_STATUSES, statusLabel, rateTone } from '../config/attendance';
import { t, fmtDate } from '../i18n';

// A student's attendance this year: totals and the latest absences / late arrivals.
// A role that may not see it (403) simply doesn't get the card.
const props = defineProps({ studentId: [String, Number] });
const data = ref(null);
const showAll = ref(false);

onMounted(async () => {
  try { data.value = await attendanceApi.student(props.studentId); } catch { data.value = null; }
});
</script>

<template>
  <div v-if="data" class="card">
    <div class="card-header">
      <h2>{{ t('attendance.titleYear', { year: data.academic_year }) }}</h2>
      <span v-if="data.totals.rate != null" :class="['badge', rateTone(data.totals.rate)]">{{ t('attendance.attendedPct', { rate: data.totals.rate }) }}</span>
    </div>
    <div class="att-totals in-card">
      <div v-for="s in ATTENDANCE_STATUSES" :key="s.value" :class="['att-total', s.value]"><b>{{ data.totals[s.value] }}</b><span>{{ s.label }}</span></div>
    </div>
    <div v-if="data.events.length" class="table-wrap">
      <table class="table compact">
        <thead><tr><th>{{ t('common.date') }}</th><th>{{ t('common.time') }}</th><th>{{ t('common.course') }}</th><th>{{ t('common.status') }}</th><th>{{ t('common.note') }}</th></tr></thead>
        <tbody>
          <tr v-for="(e, i) in showAll ? data.events : data.events.slice(0, 8)" :key="i">
            <td class="nowrap">{{ fmtDate(e.date) }}</td>
            <td class="mono">{{ e.start_time }}</td>
            <td>{{ e.course_name }}</td>
            <td><StatusBadge :value="e.status" :label="statusLabel(e.status) + (e.minutes_late ? ` (${e.minutes_late} min)` : '')" /></td>
            <td class="muted wrap">{{ e.note ?? '' }}</td>
          </tr>
        </tbody>
      </table>
      <button v-if="data.events.length > 8" class="btn secondary sm" style="margin: .75rem 1.25rem" @click="showAll = !showAll">
        {{ showAll ? t('common.showLess') : t('common.showAll', { n: data.events.length }) }}
      </button>
    </div>
    <p v-else class="empty"><AppIcon name="check" size="24" /> {{ data.totals.marks ? t('attendance.noAbsence') : t('attendance.noneYet') }}</p>
  </div>
</template>
