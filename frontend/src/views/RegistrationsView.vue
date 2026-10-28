<script setup>
import { ref, computed } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import SlideOver from '../components/SlideOver.vue';
import StatusBadge from '../components/StatusBadge.vue';
import Avatar from '../components/Avatar.vue';
import AppIcon from '../components/AppIcon.vue';
import { registrationsApi, studentsApi, classesApi } from '../api/http';
import { usePaginatedList } from '../composables/usePaginatedList';
import PaginationBar from '../components/PaginationBar.vue';

const students = ref([]);
const classes = ref([]);
const form = ref(null);
const formError = ref('');

// Server-side pagination; `status` is a filter driven by the tabs
const { items: registrations, total, totalPages, meta, page, pageSize, search, filters, loading, error, load } =
  usePaginatedList((params) => registrationsApi.list(params), { filters: { status: '' } });

const counts = computed(() => meta.value.counts ?? {});
const tabs = computed(() => [
  { key: '', label: 'All', count: Object.values(counts.value).reduce((a, b) => a + b, 0) },
  ...['pending', 'confirmed', 'cancelled'].map((key) => ({ key, label: key[0].toUpperCase() + key.slice(1), count: counts.value[key] ?? 0 })),
]);

const refreshClasses = async () => (classes.value = await classesApi.list()); // seat counts

// Dropdown data is only needed when the form opens (active students only)
async function openForm() {
  formError.value = '';
  form.value = { student_id: '', class_id: '' };
  [students.value] = await Promise.all([studentsApi.list({ status: 'active' }), refreshClasses()]);
}

async function wrap(fn, errorRef = error) {
  errorRef.value = '';
  try {
    await fn();
    await load();
    return true;
  } catch (e) {
    errorRef.value = e.message;
    return false;
  }
}

async function register() {
  if (await wrap(() => registrationsApi.create(form.value), formError)) form.value = null;
}
const setStatus = (r, status) => wrap(() => registrationsApi.setStatus(r.id, status));
const remove = (r) => confirm('Delete this registration?') && wrap(() => registrationsApi.remove(r.id));
</script>

<template>
  <section>
    <PageHeader title="Registrations" subtitle="Enroll students in classes and confirm their registration.">
      <button class="btn primary" @click="openForm"><AppIcon name="plus" />New registration</button>
    </PageHeader>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>

    <div class="card">
      <div class="toolbar">
        <div class="tabs">
          <button v-for="t in tabs" :key="t.key" :class="['tab', { active: filters.status === t.key }]" @click="filters.status = t.key">
            {{ t.label }} <span class="count">{{ t.count.toLocaleString() }}</span>
          </button>
        </div>
        <label class="search">
          <AppIcon name="search" size="16" />
          <input v-model="search" type="search" placeholder="Search student, matricule or class…" />
        </label>
      </div>
      <div class="table-wrap" :class="{ 'is-loading': loading && registrations.length }">
        <table class="table">
          <thead><tr><th>Student</th><th>Class</th><th>Year</th><th>Date</th><th>Status</th><th class="right">Actions</th></tr></thead>
          <tbody>
            <tr v-for="r in registrations" :key="r.id">
              <td>
                <RouterLink :to="`/students/${r.student_id}`" class="identity">
                  <Avatar :name="r.student" />
                  <div><div class="strong">{{ r.student }}</div><div class="muted small">{{ r.matricule }}</div></div>
                </RouterLink>
              </td>
              <td><RouterLink :to="`/classes/${r.class_id}`" class="link">{{ r.class_name }}</RouterLink></td>
              <td>{{ r.academic_year }}</td>
              <td>{{ new Date(r.registered_at).toLocaleDateString() }}</td>
              <td><StatusBadge :value="r.status" /></td>
              <td class="right">
                <div class="row-actions">
                  <button v-if="r.status !== 'confirmed'" class="btn success sm" @click="setStatus(r, 'confirmed')"><AppIcon name="check" size="14" />Confirm</button>
                  <button v-if="r.status !== 'cancelled'" class="icon-btn" title="Cancel registration" @click="setStatus(r, 'cancelled')"><AppIcon name="ban" size="16" /></button>
                  <button class="icon-btn danger" title="Delete" @click="remove(r)"><AppIcon name="trash" size="16" /></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!loading && !registrations.length" class="empty"><AppIcon name="inbox" size="32" /><p>No registrations here.</p></div>
      </div>
      <PaginationBar v-if="total" v-model:page="page" v-model:page-size="pageSize" :total="total" :total-pages="totalPages" />
    </div>

    <SlideOver v-if="form" title="New registration" @close="form = null">
      <div v-if="formError" class="alert"><AppIcon name="alert" />{{ formError }}</div>
      <form id="reg-form" class="form-grid one" @submit.prevent="register">
        <label class="field">
          <span>Student<b class="req">*</b></span>
          <select v-model="form.student_id" required>
            <option value="">Choose a student…</option>
            <option v-for="s in students" :key="s.id" :value="s.id">{{ s.last_name }} {{ s.first_name }} ({{ s.matricule }})</option>
          </select>
        </label>
        <label class="field">
          <span>Class<b class="req">*</b></span>
          <select v-model="form.class_id" required>
            <option value="">Choose a class…</option>
            <option v-for="c in classes" :key="c.id" :value="c.id" :disabled="c.enrolled >= c.capacity">
              {{ c.name }} · {{ c.academic_year }} ({{ c.enrolled }}/{{ c.capacity }} seats)
            </option>
          </select>
        </label>
        <p class="muted small">New registrations start as <b>pending</b>. Confirm them once the file is complete.</p>
      </form>
      <template #footer>
        <button class="btn secondary" @click="form = null">Cancel</button>
        <button type="submit" form="reg-form" class="btn primary">Register</button>
      </template>
    </SlideOver>
  </section>
</template>
