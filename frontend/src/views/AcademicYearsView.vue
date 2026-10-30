<script setup>
import { ref, onMounted } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import SlideOver from '../components/SlideOver.vue';
import AppIcon from '../components/AppIcon.vue';
import { academicYearsApi } from '../api/http';
import { examLabel } from '../config/grading';
import { useAuth } from '../composables/useAuth';
import { t, fmtDate } from '../i18n';

const { can } = useAuth();

const years = ref([]);
const loading = ref(true);
const error = ref('');
const form = ref(null);
const formError = ref('');
const saving = ref(false);

const day = (d) => (d ? String(d).slice(0, 10) : '');
const pretty = (d) => fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' });

async function load() {
  loading.value = true;
  try {
    years.value = await academicYearsApi.list();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// Suggest the year after the latest one (Sept 1 → June 30)
function openNew() {
  const last = years.value[0]?.name;
  const start = last ? Number(last.slice(5)) : new Date().getFullYear();
  formError.value = '';
  form.value = { name: `${start}-${start + 1}`, start_date: `${start}-09-01`, end_date: `${start + 1}-06-30`, is_current: !years.value.length };
}
const openEdit = (y) => {
  formError.value = '';
  form.value = { id: y.id, name: y.name, start_date: day(y.start_date), end_date: day(y.end_date) };
};

async function submit() {
  saving.value = true;
  formError.value = '';
  try {
    if (form.value.id) await academicYearsApi.update(form.value.id, form.value);
    else await academicYearsApi.create(form.value);
    form.value = null;
    await load();
  } catch (e) {
    formError.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function act(fn) {
  error.value = '';
  try {
    await fn();
    await load();
  } catch (e) {
    error.value = e.message;
  }
}
const setCurrent = (y) => act(() => academicYearsApi.setCurrent(y.id));
const remove = (y) => confirm(t('years.confirmDelete', { name: y.name })) && act(() => academicYearsApi.remove(y.id));

// Inline date edits save on change
const saveTrimester = (tri, key, value) => act(() => academicYearsApi.updateTrimester(tri.id, { start_date: day(tri.start_date), end_date: day(tri.end_date), [key]: value }));
const saveExam = (e, value) => act(() => academicYearsApi.updateExam(e.id, { exam_date: value }));
</script>

<template>
  <section>
    <PageHeader :title="t('years.title')" :subtitle="t('years.subtitle')">
      <button v-if="can('academics:write')" class="btn primary" @click="openNew"><AppIcon name="plus" />{{ t('years.new') }}</button>
    </PageHeader>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>
    <div v-if="loading && !years.length" class="card empty">{{ t('common.loading') }}</div>
    <div v-else-if="!years.length" class="card empty">
      <AppIcon name="calendar" size="32" />
      <p>{{ t('years.none') }}</p>
      <button v-if="can('academics:write')" class="btn secondary" @click="openNew"><AppIcon name="plus" />{{ t('years.createFirst') }}</button>
    </div>

    <div v-for="y in years" :key="y.id" class="card year-card">
      <div class="card-header">
        <div class="row-actions" style="gap: .75rem">
          <h2>{{ y.name }}</h2>
          <span v-if="y.is_current" class="pill current">{{ t('years.current') }}</span>
          <span class="muted small">{{ t('years.range', { from: pretty(y.start_date), to: pretty(y.end_date), n: y.class_count }) }}</span>
        </div>
        <div class="row-actions">
          <button v-if="!y.is_current && can('academics:write')" class="btn secondary sm" @click="setCurrent(y)"><AppIcon name="check" size="14" />{{ t('years.setCurrent') }}</button>
          <button v-if="can('academics:write')" class="icon-btn" :title="t('common.edit')" @click="openEdit(y)"><AppIcon name="edit" size="16" /></button>
          <button v-if="can('academics:write')" class="icon-btn danger" :title="t('common.delete')" @click="remove(y)"><AppIcon name="trash" size="16" /></button>
        </div>
      </div>
      <div class="trimester-grid">
        <div v-for="tri in y.trimesters" :key="tri.id" class="trimester">
          <h3>{{ t('grades.trimesterN', { n: tri.number }) }}</h3>
          <div class="form-grid">
            <label class="field"><span>{{ t('years.start') }}</span>
              <input type="date" :disabled="!can('academics:write')" :value="day(tri.start_date)" @change="saveTrimester(tri, 'start_date', $event.target.value)" /></label>
            <label class="field"><span>{{ t('years.end') }}</span>
              <input type="date" :disabled="!can('academics:write')" :value="day(tri.end_date)" @change="saveTrimester(tri, 'end_date', $event.target.value)" /></label>
            <label v-for="e in tri.exams" :key="e.id" class="field"><span>{{ t('years.examDate', { exam: examLabel(tri.number, e.number) }) }}</span>
              <input type="date" :disabled="!can('academics:write')" :value="day(e.exam_date)" @change="saveExam(e, $event.target.value)" /></label>
          </div>
        </div>
      </div>
    </div>

    <SlideOver v-if="form" :title="form.id ? t('years.editX', { name: form.name }) : t('years.new')" @close="form = null">
      <div v-if="formError" class="alert"><AppIcon name="alert" />{{ formError }}</div>
      <form id="year-form" class="form-grid" @submit.prevent="submit">
        <label class="field wide"><span>{{ t('common.name') }}<b class="req">*</b></span><input v-model="form.name" required pattern="\d{4}-\d{4}" placeholder="2026-2027" /></label>
        <label class="field"><span>{{ t('years.startDate') }}<b class="req">*</b></span><input v-model="form.start_date" type="date" required /></label>
        <label class="field"><span>{{ t('years.endDate') }}<b class="req">*</b></span><input v-model="form.end_date" type="date" required /></label>
        <label v-if="!form.id" class="check wide"><input v-model="form.is_current" type="checkbox" /> {{ t('years.makeCurrent') }}</label>
        <p v-if="!form.id" class="muted small wide">{{ t('years.autoHelp') }}</p>
      </form>
      <template #footer>
        <button class="btn secondary" @click="form = null">{{ t('common.cancel') }}</button>
        <button type="submit" form="year-form" class="btn primary" :disabled="saving">{{ saving ? t('common.saving') : t('common.save') }}</button>
      </template>
    </SlideOver>
  </section>
</template>
