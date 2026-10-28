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
import { downloadCsv } from '../utils/csv';

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
  form.value.description = `Restock: ${it.name}`;
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
  const reason = prompt(`Void voucher ${e.voucher_number} (${money(e.amount)})? Reason:`);
  if (!reason?.trim()) return;
  try {
    await expensesApi.void(e.id, reason);
    load();
  } catch (err) {
    error.value = err.message;
  }
};

async function exportCsv() {
  const all = await expensesApi.list({ ...filters, search: search.value || undefined });
  downloadCsv(`expenses-${filters.from || 'all'}-${filters.to || 'all'}.csv`, all, [
    ['voucher_number', 'Voucher'], ['spent_at', 'Date'], ['category', 'Category', shortCategory], ['description', 'Description'],
    ['supplier', 'Supplier'], ['quantity', 'Qty'], ['unit_price', 'Unit price (FCFA)'], ['amount', 'Amount (FCFA)'],
    ['method', 'Method', methodLabel], ['reference', 'Reference'], ['approved_by', 'Approved by'], ['voided', 'Voided']]);
}
</script>

<template>
  <section>
    <PageHeader title="Expenses" subtitle="What the school spends: purchases for the year, stock for the shop, running costs.">
      <button class="btn secondary" @click="exportCsv"><AppIcon name="download" />Export CSV</button>
      <button class="btn primary" @click="openForm"><AppIcon name="plus" />New expense</button>
    </PageHeader>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>

    <div class="card">
      <div class="toolbar filters">
        <label class="search">
          <AppIcon name="search" size="16" />
          <input v-model="search" type="search" placeholder="Voucher, description, supplier…" />
        </label>
        <label class="inline-field"><span class="muted small">From</span><input v-model="filters.from" type="date" /></label>
        <label class="inline-field"><span class="muted small">To</span><input v-model="filters.to" type="date" /></label>
        <select v-model="filters.category" aria-label="Category">
          <option value="">All categories</option>
          <option v-for="c in EXPENSE_CATEGORIES" :key="c.value" :value="c.value">{{ shortCategory(c.value) }}</option>
        </select>
        <select v-model="filters.academic_year" aria-label="Academic year">
          <option value="">All years</option>
          <option v-for="y in years" :key="y.id" :value="y.name">{{ y.name }}</option>
        </select>
        <span class="journal-total">Total <b>{{ money(meta.sum ?? 0) }}</b></span>
      </div>

      <div class="table-wrap" :class="{ 'is-loading': loading && rows.length }">
        <table class="table">
          <thead><tr><th>Voucher</th><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th><th>Method</th><th /></tr></thead>
          <tbody>
            <tr v-for="e in rows" :key="e.id" :class="{ voided: e.voided }">
              <td><span class="mono">{{ e.voucher_number }}</span><div v-if="e.voided"><StatusBadge value="voided" :label="`Voided: ${e.void_reason}`" /></div></td>
              <td>{{ new Date(e.spent_at).toLocaleDateString() }}</td>
              <td class="wrap"><div class="strong">{{ e.description }}</div><div class="muted small">{{ e.supplier ?? '—' }}</div></td>
              <td><span class="pill">{{ shortCategory(e.category) }}</span></td>
              <td class="num"><b>{{ money(e.amount) }}</b><div v-if="e.quantity > 1" class="muted small">{{ e.quantity }} × {{ money(e.unit_price) }}</div></td>
              <td>{{ methodLabel(e.method) }}<div v-if="e.reference" class="muted small">{{ e.reference }}</div></td>
              <td class="right"><button v-if="!e.voided" class="icon-btn danger" title="Void expense" @click="voidExpense(e)"><AppIcon name="ban" size="16" /></button></td>
            </tr>
          </tbody>
        </table>
        <div v-if="!loading && !rows.length" class="empty"><AppIcon name="inbox" size="32" /><p>No expense in this period.</p></div>
      </div>
      <PaginationBar v-if="total" v-model:page="page" v-model:page-size="pageSize" :total="total" :total-pages="totalPages" />
    </div>

    <SlideOver v-if="form" title="New expense" @close="form = null">
      <div v-if="formError" class="alert"><AppIcon name="alert" />{{ formError }}</div>
      <form id="expense-form" class="form-grid" @submit.prevent="submit">
        <label class="field wide"><span>Category<b class="req">*</b></span>
          <select v-model="form.category"><option v-for="c in EXPENSE_CATEGORIES" :key="c.value" :value="c.value">{{ c.label }}</option></select></label>
        <label v-if="isStock" class="field wide"><span>Item bought<b class="req">*</b></span>
          <select v-model="form.item_id" required>
            <option value="">Choose an item…</option>
            <option v-for="i in items" :key="i.id" :value="i.id">{{ i.name }}{{ i.stock != null ? ` (stock: ${i.stock})` : '' }}</option>
          </select></label>
        <p v-if="isStock" class="muted small wide">The quantity bought is added to the item's stock.</p>
        <label class="field wide"><span>Description<b class="req">*</b></span><input v-model="form.description" required placeholder="e.g. Tables-bancs for 6e classrooms" /></label>
        <label class="field"><span>Quantity<b class="req">*</b></span><input v-model.number="form.quantity" type="number" min="1" step="1" required /></label>
        <label class="field"><span>Unit price (FCFA)<b class="req">*</b></span><input v-model.number="form.unit_price" type="number" min="1" step="1" required /></label>
        <p class="fee-line wide">Total <b>{{ money(formTotal) }}</b></p>
        <label class="field"><span>Supplier</span><input v-model="form.supplier" /></label>
        <label class="field"><span>Date<b class="req">*</b></span><input v-model="form.spent_at" type="date" :max="today()" required /></label>
        <label class="field"><span>Method</span>
          <select v-model="form.method"><option v-for="m in METHODS" :key="m.value" :value="m.value">{{ m.label }}</option></select></label>
        <label class="field"><span>Reference<b v-if="form.method !== 'cash'" class="req">*</b></span><input v-model="form.reference" :required="form.method !== 'cash'" /></label>
        <label class="field"><span>Approved by</span><input v-model="form.approved_by" /></label>
        <label class="field"><span>Notes</span><input v-model="form.notes" /></label>
      </form>
      <template #footer>
        <button class="btn secondary" @click="form = null">Cancel</button>
        <button type="submit" form="expense-form" class="btn primary" :disabled="saving">{{ saving ? 'Saving…' : `Record ${money(formTotal)}` }}</button>
      </template>
    </SlideOver>
  </section>
</template>
