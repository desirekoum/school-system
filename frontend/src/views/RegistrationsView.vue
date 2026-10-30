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
import ExportMenu from '../components/ExportMenu.vue';
import ImportDialog from '../components/ImportDialog.vue';
import { exportRows } from '../utils/xlsx';
import { money, METHODS, schedule, today } from '../config/finance';
import { useAuth } from '../composables/useAuth';
import { t, fmtDate, fmtNum } from '../i18n';

const { can } = useAuth();

const students = ref([]);
const classes = ref([]);
const form = ref(null);
const formError = ref('');
const account = ref(null); // registration id whose tuition account is open

// Server-side pagination; `status` is a filter driven by the tabs
const { items: registrations, total, totalPages, meta, page, pageSize, search, filters, loading, error, load } =
  usePaginatedList((params) => registrationsApi.list(params), { filters: { status: '' } });

const counts = computed(() => meta.value.counts ?? {});
const STATUSES = ['pending', 'confirmed', 'cancelled'];
const tabs = computed(() => [
  { key: '', label: t('registrations.tabs.all'), count: Object.values(counts.value).reduce((a, b) => a + b, 0) },
  ...STATUSES.map((key) => ({ key, label: t(`registrations.tabs.${key}`), count: counts.value[key] ?? 0 })),
]);

const refreshClasses = async () => (classes.value = await classesApi.list()); // seat counts

// Dropdown data is only needed when the form opens (active students only)
async function openForm() {
  formError.value = '';
  form.value = { student_id: '', class_id: '', pay: can('payments:write'), amount: '', method: 'cash', reference: '', withPlan: false, instalments: 3 };
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
const remove = (r) => confirm(t('registrations.confirmDelete')) && wrap(() => registrationsApi.remove(r.id));

// Whole filtered list; "Matricule", "Class" and "Academic year" are the columns the import reads back
const importing = ref(false);
const num = (v) => (v == null ? null : Number(v));
const exporting = ref(false);
async function exportList(format) {
  exporting.value = true;
  try {
    const rows = await registrationsApi.list({ search: search.value || undefined, ...filters });
    await exportRows(format, `registrations${filters.status ? `-${filters.status}` : ''}`, rows, [
      ['matricule', t('fields.matricule')], ['student', t('common.student')], ['class_name', t('common.class')], ['academic_year', t('common.academicYear')],
      ['registered_at', t('common.date')], ['tuition_fee', t('pages.classes.tuition'), num], ['paid', t('registrations.paidFcfa'), num], ['balance', t('registrations.balanceFcfa'), num],
      ['status', t('common.status'), (v) => t(`options.status.${v}`)]]);
  } catch (e) {
    error.value = e.message;
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <section>
    <PageHeader :title="t('registrations.title')" :subtitle="t('registrations.subtitle')">
      <ExportMenu :busy="exporting" @export="exportList" />
      <button v-if="can('registrations:write')" class="btn secondary" @click="importing = true"><AppIcon name="upload" />{{ t('common.import') }}</button>
      <button v-if="can('registrations:write')" class="btn primary" @click="openForm"><AppIcon name="plus" />{{ t('registrations.new') }}</button>
    </PageHeader>
    <ImportDialog v-if="importing" :imports="[{ entity: 'registrations', label: t('registrations.title') }]" @close="importing = false" @done="load" />

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>

    <div class="card">
      <div class="toolbar">
        <div class="tabs">
          <button v-for="tb in tabs" :key="tb.key" :class="['tab', { active: filters.status === tb.key }]" @click="filters.status = tb.key">
            {{ tb.label }} <span class="count">{{ fmtNum(tb.count) }}</span>
          </button>
        </div>
        <label class="search">
          <AppIcon name="search" size="16" />
          <input v-model="search" type="search" :placeholder="t('registrations.search')" />
        </label>
      </div>
      <div class="table-wrap" :class="{ 'is-loading': loading && registrations.length }">
        <table class="table">
          <thead><tr><th>{{ t('common.student') }}</th><th>{{ t('common.class') }}</th><th>{{ t('common.year') }}</th><th>{{ t('common.date') }}</th><th class="num">{{ t('finance.balance') }}</th><th>{{ t('common.status') }}</th><th class="right">{{ t('common.actions') }}</th></tr></thead>
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
              <td>{{ fmtDate(r.registered_at) }}</td>
              <td class="num"><span :class="{ 'score-fail': r.balance > 0 && r.status !== 'cancelled' }">{{ money(r.balance) }}</span></td>
              <td><StatusBadge :value="r.status" /></td>
              <td class="right">
                <div class="row-actions">
                  <button v-if="can('finance:read')" class="btn sm" :class="r.balance > 0 && r.status !== 'cancelled' ? 'primary' : 'secondary'" @click="account = r.id"><AppIcon name="wallet" size="14" />{{ r.balance > 0 && r.status !== 'cancelled' ? t('registrations.pay') : t('finance.account') }}</button>
                  <button v-if="r.status === 'cancelled' && can('registrations:write')" class="icon-btn" :title="t('registrations.restore')" @click="setStatus(r, r.balance > 0 ? 'pending' : 'confirmed')"><AppIcon name="check" size="16" /></button>
                  <button v-if="r.status !== 'cancelled' && can('registrations:write')" class="icon-btn" :title="t('registrations.cancel')" @click="setStatus(r, 'cancelled')"><AppIcon name="ban" size="16" /></button>
                  <button v-if="can('registrations:write')" class="icon-btn danger" :title="t('common.delete')" @click="remove(r)"><AppIcon name="trash" size="16" /></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!loading && !registrations.length" class="empty"><AppIcon name="inbox" size="32" /><p>{{ t('registrations.none') }}</p></div>
      </div>
      <PaginationBar v-if="total" v-model:page="page" v-model:page-size="pageSize" :total="total" :total-pages="totalPages" />
    </div>

    <SlideOver v-if="form" :title="t('registrations.new')" @close="form = null">
      <div v-if="formError" class="alert"><AppIcon name="alert" />{{ formError }}</div>
      <form id="reg-form" class="form-grid one" @submit.prevent="register">
        <label class="field">
          <span>{{ t('common.student') }}<b class="req">*</b></span>
          <select v-model="form.student_id" required>
            <option value="">{{ t('registrations.chooseStudent') }}</option>
            <option v-for="s in students" :key="s.id" :value="s.id">{{ s.last_name }} {{ s.first_name }} ({{ s.matricule }})</option>
          </select>
        </label>
        <label class="field">
          <span>{{ t('common.class') }}<b class="req">*</b></span>
          <select v-model="form.class_id" required>
            <option value="">{{ t('registrations.chooseClass') }}</option>
            <option v-for="c in classes" :key="c.id" :value="c.id" :disabled="c.enrolled >= c.capacity">
              {{ c.name }} · {{ c.academic_year }} ({{ t('registrations.seats', { enrolled: c.enrolled, capacity: c.capacity }) }})
            </option>
          </select>
        </label>
        <template v-if="chosenClass">
          <p class="fee-line">{{ t('registrations.fee') }} <b>{{ money(chosenClass.tuition_fee) }}</b></p>
          <template v-if="chosenClass.tuition_fee > 0">
            <label v-if="can('plans:request')" class="check"><input v-model="form.withPlan" type="checkbox" /> {{ t('registrations.wantsPlan') }}</label>
            <label v-if="form.withPlan" class="field"><span>{{ t('finance.instalmentCount') }}</span>
              <select v-model.number="form.instalments"><option v-for="n in [2, 3, 4, 5, 6]" :key="n" :value="n">{{ n }}</option></select>
            </label>
            <ul v-if="plan" class="muted small plan-preview">
              <li v-for="(i, n) in plan" :key="n">#{{ n + 1 }} · {{ fmtDate(i.due_date) }} · <b>{{ money(i.amount) }}</b></li>
              <li>{{ t('registrations.planNote') }}</li>
            </ul>
            <label v-if="can('payments:write')" class="check"><input v-model="form.pay" type="checkbox" /> {{ t('registrations.payNow') }}</label>
            <div v-if="form.pay" class="form-grid">
              <label class="field"><span>{{ t('finance.amountFcfa') }}</span><input v-model.number="form.amount" type="number" min="1" :max="chosenClass.tuition_fee" step="1" /></label>
              <label class="field"><span>{{ t('common.method') }}</span>
                <select v-model="form.method"><option v-for="m in METHODS" :key="m.value" :value="m.value">{{ m.label }}</option></select></label>
              <label v-if="form.method !== 'cash'" class="field wide"><span>{{ t('common.reference') }}<b class="req">*</b></span><input v-model="form.reference" required /></label>
            </div>
          </template>
        </template>
        <i18n-t keypath="registrations.completeHelp" tag="p" class="muted small" scope="global"><template #complete><b>{{ t('registrations.complete') }}</b></template></i18n-t>
      </form>
      <template #footer>
        <button class="btn secondary" @click="form = null">{{ t('common.cancel') }}</button>
        <button type="submit" form="reg-form" class="btn primary">{{ t('registrations.register') }}</button>
      </template>
    </SlideOver>

    <SlideOver v-if="account" :title="t('finance.tuitionAccount')" @close="account = null">
      <AccountPanel :registration-id="account" @changed="load" />
    </SlideOver>
  </section>
</template>
