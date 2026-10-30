<script setup>
import { ref, onMounted } from 'vue';
import AppIcon from './AppIcon.vue';
import StatusBadge from './StatusBadge.vue';
import { attendanceApi } from '../api/http';
import { ATTENDANCE_STATUSES, statusLabel, rateTone } from '../config/attendance';

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
      <h2>Attendance {{ data.academic_year }}</h2>
      <span v-if="data.totals.rate != null" :class="['badge', rateTone(data.totals.rate)]">{{ data.totals.rate }}% attended</span>
    </div>
    <div class="att-totals in-card">
      <div v-for="s in ATTENDANCE_STATUSES" :key="s.value" :class="['att-total', s.value]"><b>{{ data.totals[s.value] }}</b><span>{{ s.label }}</span></div>
    </div>
    <div v-if="data.events.length" class="table-wrap">
      <table class="table compact">
        <thead><tr><th>Date</th><th>Time</th><th>Course</th><th>Status</th><th>Note</th></tr></thead>
        <tbody>
          <tr v-for="(e, i) in showAll ? data.events : data.events.slice(0, 8)" :key="i">
            <td class="nowrap">{{ new Date(`${e.date}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC' }) }}</td>
            <td class="mono">{{ e.start_time }}</td>
            <td>{{ e.course_name }}</td>
            <td><StatusBadge :value="e.status" :label="statusLabel(e.status) + (e.minutes_late ? ` (${e.minutes_late} min)` : '')" /></td>
            <td class="muted wrap">{{ e.note ?? '' }}</td>
          </tr>
        </tbody>
      </table>
      <button v-if="data.events.length > 8" class="btn secondary sm" style="margin: .75rem 1.25rem" @click="showAll = !showAll">
        {{ showAll ? 'Show less' : `Show all ${data.events.length}` }}
      </button>
    </div>
    <p v-else class="empty"><AppIcon name="check" size="24" /> {{ data.totals.marks ? 'No absence or late arrival.' : 'No attendance recorded yet.' }}</p>
  </div>
</template>
