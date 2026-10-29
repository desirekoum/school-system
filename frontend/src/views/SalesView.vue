<script setup>
import { ref, onMounted } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import SlideOver from '../components/SlideOver.vue';
import StatusBadge from '../components/StatusBadge.vue';
import AppIcon from '../components/AppIcon.vue';
import PaginationBar from '../components/PaginationBar.vue';
import SaleForm from '../components/SaleForm.vue';
import { salesApi, academicYearsApi } from '../api/http';
import { usePaginatedList } from '../composables/usePaginatedList';
import { money, METHODS, methodLabel } from '../config/finance';
import { downloadCsv } from '../utils/csv';
import { useAuth } from '../composables/useAuth';

const { can } = useAuth();

const years = ref([]);
const { items, total, totalPages, page, pageSize, search, filters, loading, error, meta, load } = usePaginatedList(
  (params) => salesApi.list(params),
  { filters: { academic_year: '', method: '', from: '', to: '', voided: '' } },
);
onMounted(async () => (years.value = await academicYearsApi.list()));

const selling = ref(false);
const form = ref(null); // SaleForm instance (exposes canSubmit, saving, total)
const notice = ref(null);
function saved(sale) {
  selling.value = false;
  notice.value = sale;
  load();
}

const voidSale = async (s) => {
  const reason = prompt(`Void sale ${s.receipt_number} (${money(s.total)})? The items go back in stock. Reason:`);
  if (!reason?.trim()) return;
  try {
    await salesApi.void(s.id, reason);
    load();
  } catch (e) {
    error.value = e.message;
  }
};

async function exportCsv() {
  const rows = await salesApi.list({ ...filters, search: search.value || undefined });
  downloadCsv(`sales-${filters.from || 'all'}-${filters.to || 'all'}.csv`, rows, [
    ['receipt_number', 'Receipt'], ['sold_at', 'Date'], ['buyer', 'Buyer'], ['matricule', 'Matricule'], ['summary', 'Items'],
    ['total', 'Total (FCFA)'], ['method', 'Method', methodLabel], ['reference', 'Reference'], ['received_by', 'Received by'], ['voided', 'Voided']]);
}
const receiptUrl = (id) => `/finances/sales/${id}/receipt`;
</script>

<template>
  <section>
    <PageHeader title="Sales" subtitle="Uniforms, books and other items sold to students, with their receipts.">
      <button class="btn secondary" @click="exportCsv"><AppIcon name="download" />Export CSV</button>
      <button v-if="can('sales:write')" class="btn primary" @click="selling = true; notice = null"><AppIcon name="cart" />New sale</button>
    </PageHeader>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>
    <div v-if="notice" class="alert success">
      <AppIcon name="check" />Sale {{ notice.receipt_number }} recorded: {{ money(notice.total) }}.
      <a :href="receiptUrl(notice.id)" target="_blank" class="link" style="margin-left: auto">Print receipt</a>
    </div>

    <div class="card">
      <div class="toolbar filters">
        <label class="search">
          <AppIcon name="search" size="16" />
          <input v-model="search" type="search" placeholder="Receipt, buyer, item…" />
        </label>
        <label class="inline-field"><span class="muted small">From</span><input v-model="filters.from" type="date" /></label>
        <label class="inline-field"><span class="muted small">To</span><input v-model="filters.to" type="date" /></label>
        <select v-model="filters.method" aria-label="Method">
          <option value="">All methods</option>
          <option v-for="m in METHODS" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
        <select v-model="filters.academic_year" aria-label="Academic year">
          <option value="">All years</option>
          <option v-for="y in years" :key="y.id" :value="y.name">{{ y.name }}</option>
        </select>
        <span class="journal-total">Total <b>{{ money(meta.sum ?? 0) }}</b></span>
      </div>

      <div class="table-wrap" :class="{ 'is-loading': loading && items.length }">
        <table class="table">
          <thead><tr><th>Receipt</th><th>Date</th><th>Buyer</th><th>Items</th><th>Method</th><th class="num">Total</th><th /></tr></thead>
          <tbody>
            <tr v-for="s in items" :key="s.id" :class="{ voided: s.voided }">
              <td><span class="mono">{{ s.receipt_number }}</span><div v-if="s.voided"><StatusBadge value="voided" :label="`Voided: ${s.void_reason}`" /></div></td>
              <td>{{ new Date(s.sold_at).toLocaleDateString() }}</td>
              <td>
                <RouterLink v-if="s.student_id" :to="`/students/${s.student_id}`" class="strong link">{{ s.buyer }}</RouterLink>
                <span v-else class="strong">{{ s.buyer }}</span>
                <div class="muted small">{{ s.matricule ?? 'Other buyer' }}</div>
              </td>
              <td class="small wrap summary-cell">{{ s.summary }}</td>
              <td>{{ methodLabel(s.method) }}<div v-if="s.reference" class="muted small">{{ s.reference }}</div></td>
              <td class="num strong">{{ money(s.total) }}</td>
              <td class="right">
                <div class="row-actions">
                  <a :href="receiptUrl(s.id)" target="_blank" class="icon-btn" title="Print receipt"><AppIcon name="printer" size="16" /></a>
                  <button v-if="!s.voided && can('sales:void')" class="icon-btn danger" title="Void sale" @click="voidSale(s)"><AppIcon name="ban" size="16" /></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!loading && !items.length" class="empty"><AppIcon name="inbox" size="32" /><p>No sale in this period.</p></div>
      </div>
      <PaginationBar v-if="total" v-model:page="page" v-model:page-size="pageSize" :total="total" :total-pages="totalPages" />
    </div>

    <SlideOver v-if="selling" title="New sale" @close="selling = false">
      <SaleForm ref="form" @saved="saved" />
      <template #footer>
        <span class="muted" style="margin-right: auto">Total <b>{{ money(form?.total ?? 0) }}</b></span>
        <button class="btn secondary" @click="selling = false">Cancel</button>
        <button type="submit" form="sale-form" class="btn primary" :disabled="!form?.canSubmit">{{ form?.saving ? 'Saving…' : 'Record sale' }}</button>
      </template>
    </SlideOver>
  </section>
</template>
