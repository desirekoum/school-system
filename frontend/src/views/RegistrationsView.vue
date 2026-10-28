<script setup>
import { ref, computed, watch } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import SlideOver from '../components/SlideOver.vue';
import StatusBadge from '../components/StatusBadge.vue';
import Avatar from '../components/Avatar.vue';
import AppIcon from '../components/AppIcon.vue';
import { registrationsApi, studentsApi, classesApi } from '../api/http';
import { usePaginatedList } from '../composables/usePaginatedList';
import PaginationBar from '../components/PaginationBar.vue';
import AccountPanel from '../components/AccountPanel.vue';
import { money, METHODS, schedule, today } from '../config/finance';

const students = ref([]);
const classes = ref([]);
const form = ref(null);
const formError = ref('');
const account = ref(null); // registration id whose tuition account is open

// Server-side pagination; `status` is a filter driven by the tabs
const { items: registrations, total, totalPages, meta, page, pageSize, search, filters, loading, error, load } =
  usePaginatedList((params) => registrationsApi.list(params), { filters: { status: '' } });

const counts = computed(() => meta.value.counts ?? {});
const TAB_LABELS = { pending: 'Awaiting payment', confirmed: 'Complete', cancelled: 'Cancelled' };
const tabs = computed(() => [
  { key: '', label: 'All', count: Object.values(counts.value).reduce((a, b) => a + b, 0) },
  ...Object.entries(TAB_LABELS).map(([key, label]) => ({ key, label, count: counts.value[key] ?? 0 })),
]);

const refreshClasses = async () => (classes.value = await classesApi.list()); // seat counts

// Dropdown data is only needed when the form opens (active students only)
async function openForm() {
  formError.value = '';
  form.value = { student_id: '', class_id: '', pay: true, amount: '', method: 'cash', reference: '', withPlan: false, instalments: 3 };
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

const chosenClass = computed(() => classes.value.find((c) => c.id === form.value?.class_id));
// Picking a class pre-fills the payment with its full fee (or the first instalment)
const plan = computed(() => {
  const c = chosenClass.value;
  if (!c || !form.value.withPlan || !c.tuition_fee) return null;
  return schedule(c.tuition_fee, form.value.instalments, `${c.academic_year.slice(5)}-06-30`);
});
watch([chosenClass, plan], () => {
  if (chosenClass.value) form.value.amount = plan.value ? plan.value[0].amount : chosenClass.value.tuition_fee;
});

async function register() {
  const f = form.value;
  const body = {
    student_id: f.student_id,
    class_id: f.class_id,
    payment: f.pay && Number(f.amount) > 0 ? { amount: Number(f.amount), method: f.method, reference: f.reference, paid_at: today() } : undefined,
    plan: plan.value ? { instalments: plan.value } : undefined,
  };
  let created;
  if (await wrap(async () => (created = await registrationsApi.create(body)), formError)) {
    form.value = null;
    account.value = created.id; // show the account: balance, receipt to print
  }
}
const setStatus = (r, status) => wrap(() => registrationsApi.setStatus(r.id, status));
const remove = (r) => confirm('Delete this registration?') && wrap(() => registrationsApi.remove(r.id));
</script>

<template>
  <section>
    <PageHeader title="Registrations" subtitle="Enroll students in classes. A registration is complete once the tuition is paid.">
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
          <thead><tr><th>Student</th><th>Class</th><th>Year</th><th>Date</th><th class="num">Balance</th><th>Status</th><th class="right">Actions</th></tr></thead>
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
              <td class="num"><span :class="{ 'score-fail': r.balance > 0 && r.status !== 'cancelled' }">{{ money(r.balance) }}</span></td>
              <td><StatusBadge :value="r.status" :label="r.status === 'pending' ? 'Awaiting payment' : undefined" /></td>
              <td class="right">
                <div class="row-actions">
                  <button class="btn sm" :class="r.balance > 0 && r.status !== 'cancelled' ? 'primary' : 'secondary'" @click="account = r.id"><AppIcon name="wallet" size="14" />{{ r.balance > 0 && r.status !== 'cancelled' ? 'Pay' : 'Account' }}</button>
                  <button v-if="r.status === 'cancelled'" class="icon-btn" title="Restore registration" @click="setStatus(r, r.balance > 0 ? 'pending' : 'confirmed')"><AppIcon name="check" size="16" /></button>
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
        <template v-if="chosenClass">
          <p class="fee-line">Tuition fee <b>{{ money(chosenClass.tuition_fee) }}</b></p>
          <template v-if="chosenClass.tuition_fee > 0">
            <label class="check"><input v-model="form.withPlan" type="checkbox" /> The family requests an instalment plan</label>
            <label v-if="form.withPlan" class="field"><span>Number of instalments</span>
              <select v-model.number="form.instalments"><option v-for="n in [2, 3, 4, 5, 6]" :key="n" :value="n">{{ n }}</option></select>
            </label>
            <ul v-if="plan" class="muted small plan-preview">
              <li v-for="(i, n) in plan" :key="n">#{{ n + 1 }} · {{ new Date(i.due_date).toLocaleDateString() }} · <b>{{ money(i.amount) }}</b></li>
              <li>Dates can be adjusted from the tuition account. The plan must be approved.</li>
            </ul>
            <label class="check"><input v-model="form.pay" type="checkbox" /> Record a payment now</label>
            <div v-if="form.pay" class="form-grid">
              <label class="field"><span>Amount (FCFA)</span><input v-model.number="form.amount" type="number" min="1" :max="chosenClass.tuition_fee" step="1" /></label>
              <label class="field"><span>Method</span>
                <select v-model="form.method"><option v-for="m in METHODS" :key="m.value" :value="m.value">{{ m.label }}</option></select></label>
              <label v-if="form.method !== 'cash'" class="field wide"><span>Reference<b class="req">*</b></span><input v-model="form.reference" required /></label>
            </div>
          </template>
        </template>
        <p class="muted small">The registration is <b>complete</b> (confirmed) once the tuition is fully paid.</p>
      </form>
      <template #footer>
        <button class="btn secondary" @click="form = null">Cancel</button>
        <button type="submit" form="reg-form" class="btn primary">Register</button>
      </template>
    </SlideOver>

    <SlideOver v-if="account" title="Tuition account" @close="account = null">
      <AccountPanel :registration-id="account" @changed="load" />
    </SlideOver>
  </section>
</template>
