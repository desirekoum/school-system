<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import SlideOver from '../components/SlideOver.vue';
import StatusBadge from '../components/StatusBadge.vue';
import AppIcon from '../components/AppIcon.vue';
import PaginationBar from '../components/PaginationBar.vue';
import { expensesApi, itemsApi, academicYearsApi } from '../api/http';
import { usePaginatedList } from '../composables/usePaginatedList';
import { money, METHODS, methodLabel, EXPENSE_CATEGORIES, shortCategory, today } from '../config/finance';
import { exportRows } from '../utils/xlsx';
import ExportMenu from '../components/ExportMenu.vue';
import { useAuth } from '../composables/useAuth';
import { t, fmtDate } from '../i18n';

const { can } = useAuth();

const years = ref([]);
const items = ref([]);
const { items: rows, total, totalPages, page, pageSize, search, filters, loading, error, meta, load } = usePaginatedList(
  (params) => expensesApi.list(params),
  { filters: { academic_year: '', category: '', method: '', from: '', to: '', voided: '' } },
);
onMounted(async () => (years.value = await academicYearsApi.list()));

// ---------- New expense ----------
const form = ref(null);
const formError = ref('');
const saving = ref(false);
async function openForm() {
  formError.value = '';
  form.value = { category: 'supplies', description: '', supplier: '', item_id: '', quantity: 1, unit_price: '', spent_at: today(), method: 'cash', reference: '', approved_by: '', notes: '' };
  items.value = await itemsApi.list({ is_active: true });
}
const isStock = computed(() => form.value?.category === 'stock');
const formTotal = computed(() => (Number(form.value?.quantity) || 0) * (Number(form.value?.unit_price) || 0));
// Picking an item suggests its description and a purchase price (~65% of the selling price)
watch(() => form.value?.item_id, (id) => {
  const it = items.value.find((i) => i.id === Number(id));
  if (!it) return;
  form.value.description = t('receipts.restock', { name: it.name });
  if (!form.value.unit_price) form.value.unit_price = Math.round((it.price * 0.65) / 50) * 50;
});

async function submit() {
  saving.value = true;
  formError.value = '';
  try {
    const f = form.value;
    await expensesApi.create({ ...f, item_id: isStock.value ? f.item_id || null : null, quantity: Number(f.quantity), unit_price: Number(f.unit_price) });
    form.value = null;
    load();
  } catch (e) {
    formError.value = e.message;
  } finally {
    saving.value = false;
  }
}

const voidExpense = async (e) => {
  const reason = prompt(t('receipts.voidPrompt', { voucher: e.voucher_number, amount: money(e.amount) }));
  if (!reason?.trim()) return;
  try {
    await expensesApi.void(e.id, reason);
    load();
  } catch (err) {
    error.value = err.message;
  }
};

async function exportList(format) {
  const all = await expensesApi.list({ ...filters, search: search.value || undefined });
  await exportRows(format, `expenses-${filters.from || 'all'}-${filters.to || 'all'}`, all, [
    ['voucher_number', t('receipts.voucher')], ['spent_at', t('common.date')], ['category', t('common.category'), shortCategory], ['description', t('common.description')],
    ['supplier', t('receipts.supplier')], ['quantity', t('finance.qty')], ['unit_price', t('receipts.unitPriceFcfa')], ['amount', t('finance.amountFcfa')],
    ['method', t('common.method'), methodLabel], ['reference', t('common.reference')], ['approved_by', t('receipts.approvedBy')],
    ['voided', t('finance.voided'), (v) => t(`common.${v ? 'yes' : 'no'}`)]]);
}
</script>

<template>
  <section>
    <PageHeader :title="t('receipts.expensesTitle')" :subtitle="t('receipts.expensesSubtitle')">
      <ExportMenu @export="exportList" />
      <button v-if="can('expenses:write')" class="btn primary" @click="openForm"><AppIcon name="plus" />{{ t('receipts.newExpense') }}</button>
    </PageHeader>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>

    <div class="card">
      <div class="toolbar filters">
        <label class="search">
          <AppIcon name="search" size="16" />
          <input v-model="search" type="search" :placeholder="t('receipts.searchExpenses')" />
        </label>
        <label class="inline-field"><span class="muted small">{{ t('common.from') }}</span><input v-model="filters.from" type="date" /></label>
        <label class="inline-field"><span class="muted small">{{ t('common.to') }}</span><input v-model="filters.to" type="date" /></label>
        <select v-model="filters.category" :aria-label="t('common.category')">
          <option value="">{{ t('receipts.allCategories') }}</option>
          <option v-for="c in EXPENSE_CATEGORIES" :key="c.value" :value="c.value">{{ shortCategory(c.value) }}</option>
        </select>
        <select v-model="filters.academic_year" :aria-label="t('common.academicYear')">
          <option value="">{{ t('finance.allYears') }}</option>
          <option v-for="y in years" :key="y.id" :value="y.name">{{ y.name }}</option>
        </select>
        <span class="journal-total">{{ t('common.total') }} <b>{{ money(meta.sum ?? 0) }}</b></span>
      </div>

      <div class="table-wrap" :class="{ 'is-loading': loading && rows.length }">
        <table class="table">
          <thead><tr><th>{{ t('receipts.voucher') }}</th><th>{{ t('common.date') }}</th><th>{{ t('common.description') }}</th><th>{{ t('common.category') }}</th><th class="num">{{ t('common.amount') }}</th><th>{{ t('common.method') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="e in rows" :key="e.id" :class="{ voided: e.voided }">
              <td><span class="mono">{{ e.voucher_number }}</span><div v-if="e.voided"><StatusBadge value="voided" :label="t('finance.voidedX', { reason: e.void_reason })" /></div></td>
              <td>{{ fmtDate(e.spent_at) }}</td>
              <td class="wrap"><div class="strong">{{ e.description }}</div><div class="muted small">{{ e.supplier ?? '—' }}</div></td>
              <td><span class="pill">{{ shortCategory(e.category) }}</span></td>
              <td class="num"><b>{{ money(e.amount) }}</b><div v-if="e.quantity > 1" class="muted small">{{ e.quantity }} × {{ money(e.unit_price) }}</div></td>
              <td>{{ methodLabel(e.method) }}<div v-if="e.reference" class="muted small">{{ e.reference }}</div></td>
              <td class="right"><button v-if="!e.voided && can('expenses:void')" class="icon-btn danger" :title="t('receipts.voidExpense')" @click="voidExpense(e)"><AppIcon name="ban" size="16" /></button></td>
            </tr>
          </tbody>
        </table>
        <div v-if="!loading && !rows.length" class="empty"><AppIcon name="inbox" size="32" /><p>{{ t('receipts.noExpense') }}</p></div>
      </div>
      <PaginationBar v-if="total" v-model:page="page" v-model:page-size="pageSize" :total="total" :total-pages="totalPages" />
    </div>

    <SlideOver v-if="form" :title="t('receipts.newExpense')" @close="form = null">
      <div v-if="formError" class="alert"><AppIcon name="alert" />{{ formError }}</div>
      <form id="expense-form" class="form-grid" @submit.prevent="submit">
        <label class="field wide"><span>{{ t('common.category') }}<b class="req">*</b></span>
          <select v-model="form.category"><option v-for="c in EXPENSE_CATEGORIES" :key="c.value" :value="c.value">{{ c.label }}</option></select></label>
        <label v-if="isStock" class="field wide"><span>{{ t('receipts.itemBought') }}<b class="req">*</b></span>
          <select v-model="form.item_id" required>
            <option value="">{{ t('receipts.chooseItem') }}</option>
            <option v-for="i in items" :key="i.id" :value="i.id">{{ i.name }}{{ i.stock != null ? t('receipts.stockX', { n: i.stock }) : '' }}</option>
          </select></label>
        <p v-if="isStock" class="muted small wide">{{ t('receipts.stockHelp') }}</p>
        <label class="field wide"><span>{{ t('common.description') }}<b class="req">*</b></span><input v-model="form.description" required :placeholder="t('receipts.descriptionHint')" /></label>
        <label class="field"><span>{{ t('common.quantity') }}<b class="req">*</b></span><input v-model.number="form.quantity" type="number" min="1" step="1" required /></label>
        <label class="field"><span>{{ t('receipts.unitPriceFcfa') }}<b class="req">*</b></span><input v-model.number="form.unit_price" type="number" min="1" step="1" required /></label>
        <p class="fee-line wide">{{ t('common.total') }} <b>{{ money(formTotal) }}</b></p>
        <label class="field"><span>{{ t('receipts.supplier') }}</span><input v-model="form.supplier" /></label>
        <label class="field"><span>{{ t('common.date') }}<b class="req">*</b></span><input v-model="form.spent_at" type="date" :max="today()" required /></label>
        <label class="field"><span>{{ t('common.method') }}</span>
          <select v-model="form.method"><option v-for="m in METHODS" :key="m.value" :value="m.value">{{ m.label }}</option></select></label>
        <label class="field"><span>{{ t('common.reference') }}<b v-if="form.method !== 'cash'" class="req">*</b></span><input v-model="form.reference" :required="form.method !== 'cash'" /></label>
        <label class="field"><span>{{ t('receipts.approvedBy') }}</span><input v-model="form.approved_by" /></label>
        <label class="field"><span>{{ t('finance.notes') }}</span><input v-model="form.notes" /></label>
      </form>
      <template #footer>
        <button class="btn secondary" @click="form = null">{{ t('common.cancel') }}</button>
        <button type="submit" form="expense-form" class="btn primary" :disabled="saving">{{ saving ? t('common.saving') : t('finance.recordAmount', { amount: money(formTotal) }) }}</button>
      </template>
    </SlideOver>
  </section>
</template>
