<script setup>
import AppIcon from './AppIcon.vue';
import { scoreTone, fmt, mention, ordinal } from '../config/grading';
import { t } from '../i18n';

/** The grades table of a report card: exam scores, trimester and year averages, ranks. Shared by the screen and the print view. */
const props = defineProps({ card: { type: Object, required: true } });
const examsOf = (tri) => props.card.exams.filter((e) => e.trimester === tri);
</script>

<template>
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
