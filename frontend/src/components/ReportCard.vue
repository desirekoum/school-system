<script setup>
import { ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';
import { studentsApi } from '../api/http';
import ReportCardTable from './ReportCardTable.vue';
import { useAuth } from '../composables/useAuth';
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

const { canPrintCards } = useAuth();
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
        <button v-if="canPrintCards(card.registration.homeroom_teacher_id)" class="btn secondary sm" @click="print"><AppIcon name="printer" size="14" />{{ t('common.print') }}</button>
      </div>
    </div>

    <div v-if="error" class="alert" style="margin: 1rem"><AppIcon name="alert" />{{ error }}</div>
    <div v-else-if="loading && !card" class="empty">{{ t('common.loading') }}</div>
    <div v-else-if="card && !card.registration" class="empty"><p>{{ t('grades.noGrades') }}</p></div>

    <template v-else-if="card">
      <p class="muted small" style="padding: .75rem 1.25rem 0">
        {{ card.registration.class_name }} · {{ card.registration.academic_year }}
      </p>
      <ReportCardTable :card="card" />
    </template>
  </div>
</template>
