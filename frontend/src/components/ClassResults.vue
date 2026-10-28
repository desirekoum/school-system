<script setup>
import { ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';
import Avatar from './Avatar.vue';
import { classesApi } from '../api/http';
import { mention, scoreTone, fmt, PASS_MARK } from '../config/grading';

/** Ranked results of a class for a trimester or the whole year. */
const props = defineProps({ classId: { type: [String, Number], required: true } });

const PERIODS = [
  { value: 1, label: 'Trimester 1' },
  { value: 2, label: 'Trimester 2' },
  { value: 3, label: 'Trimester 3' },
  { value: null, label: 'Full year' },
];
const period = ref(null);
const data = ref(null);
const loading = ref(false);
const error = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await classesApi.results(props.classId, period.value);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
watch(period, load, { immediate: true });

const print = () => window.print();

// Lets the parent refresh after grades are saved
defineExpose({ load });
</script>

<template>
  <div>
    <div class="toolbar card" style="margin-bottom: 1rem">
      <div class="segmented" style="margin: 0">
        <button v-for="p in PERIODS" :key="String(p.value)" type="button" :class="{ active: period === p.value }" @click="period = p.value">{{ p.label }}</button>
      </div>
      <button class="btn secondary sm no-print" @click="print"><AppIcon name="printer" size="14" />Print</button>
    </div>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>

    <template v-if="data">
      <div class="stats">
        <div class="card stat"><span class="stat-icon"><AppIcon name="award" size="22" /></span>
          <div><p class="muted small">Class average</p><p class="stat-value" :class="scoreTone(data.stats.average)">{{ fmt(data.stats.average) }}</p></div></div>
        <div class="card stat"><span class="stat-icon"><AppIcon name="check" size="22" /></span>
          <div><p class="muted small">Pass rate (≥ {{ PASS_MARK }})</p><p class="stat-value">{{ data.stats.pass_rate ?? '—' }}<small v-if="data.stats.pass_rate != null">%</small></p></div></div>
        <div class="card stat"><span class="stat-icon"><AppIcon name="students" size="22" /></span>
          <div><p class="muted small">Highest / lowest</p><p class="stat-value">{{ fmt(data.stats.highest) }} <small>/ {{ fmt(data.stats.lowest) }}</small></p></div></div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2>{{ data.class.name }} · {{ PERIODS.find((p) => p.value === period).label }}</h2>
          <span class="muted small">{{ data.stats.graded }} of {{ data.stats.students }} students graded</span>
        </div>
        <div class="table-wrap" :class="{ 'is-loading': loading }">
          <table class="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th class="sticky-col">Student</th>
                <th v-for="c in data.courses" :key="c.id" class="num" :title="`${c.name} · coefficient ${c.coefficient}`">{{ c.code }}<br /><span class="muted">×{{ c.coefficient }}</span></th>
                <th class="num">General</th>
                <th>Mention</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in data.students" :key="s.id">
                <td><span class="rank" :class="{ top: s.rank && s.rank <= 3 }">{{ s.rank ?? '—' }}</span></td>
                <td class="sticky-col">
                  <RouterLink :to="`/students/${s.id}`" class="identity">
                    <Avatar :name="`${s.first_name} ${s.last_name}`" :src="s.photo_url" :size="30" />
                    <div><div class="strong">{{ s.last_name }} {{ s.first_name }}</div><div class="muted small">{{ s.matricule }}</div></div>
                  </RouterLink>
                </td>
                <td v-for="c in data.courses" :key="c.id" class="num" :class="scoreTone(s.course_avgs[c.id])">{{ fmt(s.course_avgs[c.id]) }}</td>
                <td class="num"><b :class="scoreTone(s.general_avg)">{{ fmt(s.general_avg) }}</b></td>
                <td>{{ mention(s.general_avg) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="!data.students.length" class="empty"><p>No student registered in this class.</p></div>
        </div>
        <p class="card-foot" style="background: var(--gray-25); color: var(--muted); font-weight: 400">
          Course average = mean of the exams in the period. General average = course averages weighted by coefficient.
        </p>
      </div>
    </template>
  </div>
</template>
