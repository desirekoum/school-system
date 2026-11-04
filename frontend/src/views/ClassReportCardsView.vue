<script setup>
import { ref, onMounted } from 'vue';
import AppIcon from '../components/AppIcon.vue';
import ReportCardTable from '../components/ReportCardTable.vue';
import { classesApi } from '../api/http';
import { useAuth } from '../composables/useAuth';
import logo from '../assets/logo.png';
import { t, fmtDate } from '../i18n';

/**
 * Every report card of a class, one per printed page (CSS `break-after: page`), printed in a single job.
 * Open to the principal, the office, and the homeroom teacher of this class (the API checks it too).
 */
const props = defineProps({ id: String });
const { canPrintCards } = useAuth();
const data = ref(null);
const error = ref('');

onMounted(async () => {
  try {
    data.value = await classesApi.reportCards(props.id);
    if (!canPrintCards(data.value.class.homeroom_teacher_id)) error.value = t('pages.forbidden.title');
  } catch (e) {
    error.value = e.message;
  }
});
const today = fmtDate(new Date().toISOString().slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' });
const print = () => window.print();
</script>

<template>
  <section>
    <div class="row-actions no-print cards-bar">
      <RouterLink :to="`/classes/${id}?tab=results`" class="btn secondary">{{ t('common.back') }}</RouterLink>
      <span v-if="data" class="muted">{{ t('grades.cardsTitle', { name: data.class.name }) }} · {{ t('grades.cardsCount', { n: data.cards.length }) }}</span>
      <button v-if="data?.cards.length && !error" class="btn primary" @click="print"><AppIcon name="printer" />{{ t('grades.printCards') }}</button>
    </div>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>
    <div v-else-if="!data" class="card empty">{{ t('common.loading') }}</div>
    <div v-else-if="!data.cards.length" class="card empty">{{ t('grades.noStudentsCards') }}</div>

    <template v-else>
      <article v-for="c in data.cards" :key="c.student.id" class="card print-card">
        <header class="receipt-head">
          <div class="brand"><img :src="logo" alt="" /><span>School<b>Doc</b></span></div>
          <div class="right">
            <p class="receipt-title">{{ t('grades.reportCard') }}</p>
            <p class="muted small">{{ t('common.academicYear') }} {{ data.class.academic_year }}</p>
          </div>
        </header>
        <dl class="info">
          <div><dt>{{ t('common.student') }}</dt><dd>{{ c.student.last_name }} {{ c.student.first_name }}</dd></div>
          <div><dt>{{ t('fields.matricule') }}</dt><dd>{{ c.student.matricule }}</dd></div>
          <div><dt>{{ t('common.class') }}</dt><dd>{{ data.class.name }}</dd></div>
          <div><dt>{{ t('grades.homeroomTeacher') }}</dt><dd>{{ data.class.homeroom_teacher ?? '—' }}</dd></div>
        </dl>
        <ReportCardTable :card="c" />
        <div class="remarks">
          <span class="muted small">{{ t('grades.conduct') }}</span>
        </div>
        <footer class="signatures">
          <div><span class="muted small">{{ t('grades.homeroomSignature') }}</span></div>
          <div><span class="muted small">{{ t('grades.principalSignature') }}</span></div>
          <div><span class="muted small">{{ t('grades.parentSignature') }}</span></div>
        </footer>
        <p class="muted small printed">{{ t('grades.printedOn', { date: today }) }}</p>
      </article>
    </template>
  </section>
</template>

<style scoped>
.cards-bar { margin-bottom: 1rem; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: .75rem; }
.print-card { padding: 1.25rem 1.5rem; margin-bottom: 1.5rem; display: grid; gap: .9rem; }
.print-card :deep(.table-wrap) { overflow: visible; }
.remarks { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: .5rem .75rem; min-height: 64px; }
.signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
.signatures > div { border-top: 1px solid var(--border); padding-top: .4rem; min-height: 56px; }
.printed { text-align: right; margin: 0; }
@media (max-width: 640px) { .signatures { grid-template-columns: 1fr; } }
@media print {
  /* One student per sheet; the last one doesn't push an empty page */
  .print-card { break-after: page; break-inside: auto; margin: 0; padding: 0; border: none; box-shadow: none; }
  .print-card:last-child { break-after: auto; }
  .print-card :deep(dl.info) { grid-template-columns: repeat(4, minmax(0, 1fr)); padding: 0 0 .25rem; gap: .5rem 1rem; }
  /* Fit the 13 columns on an A4 portrait page: smaller type, tight cells, course names may wrap */
  .print-card :deep(.table.report) { font-size: 8.5pt; }
  .print-card :deep(.table.report th), .print-card :deep(.table.report td) { padding: .2rem .25rem; white-space: nowrap; }
  .print-card :deep(.table.report td:first-child), .print-card :deep(.table.report th:first-child) { white-space: normal; }
  .print-card :deep(.card-foot) { padding: .4rem .5rem; }
}
</style>
