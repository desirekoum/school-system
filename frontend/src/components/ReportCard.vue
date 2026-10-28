<script setup>
import { ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';
import { studentsApi } from '../api/http';
import { scoreTone, fmt, mention, ordinal } from '../config/grading';

/** Report card (bulletin) of a student for one academic year. */
const props = defineProps({ studentId: { type: [String, Number], required: true } });

const year = ref(undefined); // undefined = let the API pick (current year, else latest)
const card = ref(null);
const loading = ref(false);
const error = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    card.value = await studentsApi.reportCard(props.studentId, year.value);
    year.value ??= card.value.registration?.academic_year;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
watch(year, (now, before) => before !== undefined && load());
load();

const examsOf = (t) => card.value.exams.filter((e) => e.trimester === t);
const print = () => window.print();
</script>

<template>
  <div class="card">
    <div class="card-header">
      <h2>Report card</h2>
      <div v-if="card?.registration" class="row-actions no-print">
        <select v-if="card.years.length > 1" v-model="year" style="width: auto; height: 32px">
          <option v-for="y in card.years" :key="y" :value="y">{{ y }}</option>
        </select>
        <button class="btn secondary sm" @click="print"><AppIcon name="printer" size="14" />Print</button>
      </div>
    </div>

    <div v-if="error" class="alert" style="margin: 1rem"><AppIcon name="alert" />{{ error }}</div>
    <div v-else-if="loading && !card" class="empty">Loading…</div>
    <div v-else-if="card && !card.registration" class="empty"><p>No registration, so no grades yet.</p></div>

    <template v-else-if="card">
      <p class="muted small" style="padding: .75rem 1.25rem 0">
        {{ card.registration.class_name }} · {{ card.registration.academic_year }}
      </p>
      <div class="table-wrap">
        <table class="table report">
          <thead>
            <tr>
              <th rowspan="2">Course</th>
              <th rowspan="2">Coef.</th>
              <th v-for="t in [1, 2, 3]" :key="t" :colspan="examsOf(t).length + 1">Trimester {{ t }}</th>
              <th rowspan="2" class="avg-col">Year</th>
            </tr>
            <tr>
              <template v-for="t in [1, 2, 3]" :key="t">
                <th v-for="e in examsOf(t)" :key="e.id">Exam {{ e.number }}</th>
                <th class="avg-col">Avg</th>
              </template>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in card.courses" :key="c.id">
              <td><span class="strong">{{ c.name }}</span></td>
              <td>{{ c.coefficient }}</td>
              <template v-for="t in [1, 2, 3]" :key="t">
                <td v-for="e in examsOf(t)" :key="e.id" :class="scoreTone(c.scores[e.id])">{{ fmt(c.scores[e.id]) }}</td>
                <td class="avg-col" :class="scoreTone(c.trimester_avgs[t - 1])">{{ fmt(c.trimester_avgs[t - 1]) }}</td>
              </template>
              <td class="avg-col" :class="scoreTone(c.year_avg)">{{ fmt(c.year_avg) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2">General average</td>
              <template v-for="(s, i) in card.summary.slice(0, 3)" :key="i">
                <td :colspan="examsOf(i + 1).length" class="muted small">class avg {{ fmt(s.class_average) }}</td>
                <td class="avg-col" :class="scoreTone(s.general_avg)">{{ fmt(s.general_avg) }}</td>
              </template>
              <td class="avg-col" :class="scoreTone(card.summary[3].general_avg)">{{ fmt(card.summary[3].general_avg) }}</td>
            </tr>
            <tr>
              <td colspan="2">Rank</td>
              <template v-for="(s, i) in card.summary.slice(0, 3)" :key="i">
                <td :colspan="examsOf(i + 1).length + 1">{{ ordinal(s.rank) }} / {{ s.class_size }}</td>
              </template>
              <td class="avg-col">{{ ordinal(card.summary[3].rank) }} / {{ card.summary[3].class_size }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="card-foot" style="background: var(--gray-25); color: var(--text)">
        <AppIcon name="award" size="16" /> Year: <b :class="scoreTone(card.summary[3].general_avg)">{{ fmt(card.summary[3].general_avg) }} / 20</b>
        · {{ mention(card.summary[3].general_avg) }}
      </p>
    </template>
  </div>
</template>
