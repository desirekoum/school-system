<script setup>
import { ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';
import Avatar from './Avatar.vue';
import { classesApi } from '../api/http';
import { mention, scoreTone, fmt, PASS_MARK } from '../config/grading';
import { t } from '../i18n';

/** Ranked results of a class for a trimester or the whole year. */
const props = defineProps({ classId: { type: [String, Number], required: true } });

const PERIODS = [1, 2, 3, null].map((value) => ({ value, get label() { return value ? t('grades.trimesterN', { n: value }) : t('grades.fullYear'); } }));
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
      <button class="btn secondary sm no-print" @click="print"><AppIcon name="printer" size="14" />{{ t('common.print') }}</button>
    </div>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>

    <template v-if="data">
      <div class="stats">
        <div class="card stat"><span class="stat-icon"><AppIcon name="award" size="22" /></span>
          <div><p class="muted small">{{ t('grades.classAverage') }}</p><p class="stat-value" :class="scoreTone(data.stats.average)">{{ fmt(data.stats.average) }}</p></div></div>
        <div class="card stat"><span class="stat-icon"><AppIcon name="check" size="22" /></span>
          <div><p class="muted small">{{ t('grades.passRate', { mark: PASS_MARK }) }}</p><p class="stat-value">{{ data.stats.pass_rate ?? '—' }}<small v-if="data.stats.pass_rate != null">%</small></p></div></div>
        <div class="card stat"><span class="stat-icon"><AppIcon name="students" size="22" /></span>
          <div><p class="muted small">{{ t('grades.highLow') }}</p><p class="stat-value">{{ fmt(data.stats.highest) }} <small>/ {{ fmt(data.stats.lowest) }}</small></p></div></div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2>{{ data.class.name }} · {{ PERIODS.find((p) => p.value === period).label }}</h2>
          <span class="muted small">{{ t('grades.gradedOf', { graded: data.stats.graded, students: data.stats.students }) }}</span>
        </div>
        <div class="table-wrap" :class="{ 'is-loading': loading }">
          <table class="table">
            <thead>
              <tr>
                <th>{{ t('grades.rank') }}</th>
                <th class="sticky-col">{{ t('common.student') }}</th>
                <th v-for="c in data.courses" :key="c.id" class="num" :title="t('grades.coefficientX', { name: c.name, n: c.coefficient })">{{ c.code }}<br /><span class="muted">×{{ c.coefficient }}</span></th>
                <th class="num">{{ t('grades.general') }}</th>
                <th>{{ t('grades.mention') }}</th>
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
          <div v-if="!data.students.length" class="empty"><p>{{ t('grades.noStudent') }}</p></div>
        </div>
        <p class="card-foot" style="background: var(--gray-25); color: var(--muted); font-weight: 400">
          {{ t('grades.resultsFoot') }}
        </p>
      </div>
    </template>
  </div>
</template>
