<script setup>
import { ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';
import { studentsApi } from '../api/http';
import { scoreTone, fmt, mention, ordinal } from '../config/grading';
import { t } from '../i18n';

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

const examsOf = (tri) => card.value.exams.filter((e) => e.trimester === tri);
const print = () => window.print();
</script>

<template>
  <div class="card">
    <div class="card-header">
      <h2>{{ t('grades.reportCard') }}</h2>
      <div v-if="card?.registration" class="row-actions no-print">
        <select v-if="card.years.length > 1" v-model="year" style="width: auto; height: 32px">
          <option v-for="y in card.years" :key="y" :value="y">{{ y }}</option>
        </select>
        <button class="btn secondary sm" @click="print"><AppIcon name="printer" size="14" />{{ t('common.print') }}</button>
      </div>
    </div>

    <div v-if="error" class="alert" style="margin: 1rem"><AppIcon name="alert" />{{ error }}</div>
    <div v-else-if="loading && !card" class="empty">{{ t('common.loading') }}</div>
    <div v-else-if="card && !card.registration" class="empty"><p>{{ t('grades.noGrades') }}</p></div>

    <template v-else-if="card">
      <p class="muted small" style="padding: .75rem 1.25rem 0">
        {{ card.registration.class_name }} · {{ card.registration.academic_year }}
      </p>
      <div class="table-wrap">
        <table class="table report">
          <thead>
            <tr>
              <th rowspan="2">{{ t('common.course') }}</th>
              <th rowspan="2">{{ t('grades.coefShort') }}</th>
              <th v-for="tri in [1, 2, 3]" :key="tri" :colspan="examsOf(tri).length + 1">{{ t('grades.trimesterN', { n: tri }) }}</th>
              <th rowspan="2" class="avg-col">{{ t('grades.year') }}</th>
            </tr>
            <tr>
              <template v-for="tri in [1, 2, 3]" :key="tri">
                <th v-for="e in examsOf(tri)" :key="e.id">{{ t('grades.examN', { n: e.number }) }}</th>
                <th class="avg-col">{{ t('grades.avg') }}</th>
              </template>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in card.courses" :key="c.id">
              <td><span class="strong">{{ c.name }}</span></td>
              <td>{{ c.coefficient }}</td>
              <template v-for="tri in [1, 2, 3]" :key="tri">
                <td v-for="e in examsOf(tri)" :key="e.id" :class="scoreTone(c.scores[e.id])">{{ fmt(c.scores[e.id]) }}</td>
                <td class="avg-col" :class="scoreTone(c.trimester_avgs[tri - 1])">{{ fmt(c.trimester_avgs[tri - 1]) }}</td>
              </template>
              <td class="avg-col" :class="scoreTone(c.year_avg)">{{ fmt(c.year_avg) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2">{{ t('grades.generalAverage') }}</td>
              <template v-for="(s, i) in card.summary.slice(0, 3)" :key="i">
                <td :colspan="examsOf(i + 1).length" class="muted small">{{ t('grades.classAvg', { n: fmt(s.class_average) }) }}</td>
                <td class="avg-col" :class="scoreTone(s.general_avg)">{{ fmt(s.general_avg) }}</td>
              </template>
              <td class="avg-col" :class="scoreTone(card.summary[3].general_avg)">{{ fmt(card.summary[3].general_avg) }}</td>
            </tr>
            <tr>
              <td colspan="2">{{ t('grades.rank') }}</td>
              <template v-for="(s, i) in card.summary.slice(0, 3)" :key="i">
                <td :colspan="examsOf(i + 1).length + 1">{{ ordinal(s.rank) }} / {{ s.class_size }}</td>
              </template>
              <td class="avg-col">{{ ordinal(card.summary[3].rank) }} / {{ card.summary[3].class_size }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="card-foot" style="background: var(--gray-25); color: var(--text)">
        <AppIcon name="award" size="16" /> {{ t('grades.yearLabel') }} <b :class="scoreTone(card.summary[3].general_avg)">{{ fmt(card.summary[3].general_avg) }} / 20</b>
        · {{ mention(card.summary[3].general_avg) }}
      </p>
    </template>
  </div>
</template>
