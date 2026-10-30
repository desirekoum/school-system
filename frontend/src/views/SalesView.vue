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
import { exportRows } from '../utils/xlsx';
import ExportMenu from '../components/ExportMenu.vue';
import { useAuth } from '../composables/useAuth';
import { t, fmtDate } from '../i18n';

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
  const reason = prompt(t('finance.voidSalePrompt', { receipt: s.receipt_number, amount: money(s.total) }));
  if (!reason?.trim()) return;
  try {
    await salesApi.void(s.id, reason);
    load();
  } catch (e) {
    error.value = e.message;
  }
};

async function exportList(format) {
  const rows = await salesApi.list({ ...filters, search: search.value || undefined });
  await exportRows(format, `sales-${filters.from || 'all'}-${filters.to || 'all'}`, rows, [
    ['receipt_number', t('finance.receipt')], ['sold_at', t('common.date')], ['buyer', t('finance.buyer')], ['matricule', t('fields.matricule')], ['summary', t('finance.items')],
    ['total', t('finance.totalFcfa')], ['method', t('common.method'), methodLabel], ['reference', t('common.reference')], ['received_by', t('finance.receivedBy')],
    ['voided', t('finance.voided'), (v) => t(`common.${v ? 'yes' : 'no'}`)]]);
}
const receiptUrl = (id) => `/finances/sales/${id}/receipt`;
</script>

<template>
  <section>
    <PageHeader :title="t('finance.salesTitle')" :subtitle="t('finance.salesSubtitle')">
      <ExportMenu @export="exportList" />
      <button v-if="can('sales:write')" class="btn primary" @click="selling = true; notice = null"><AppIcon name="cart" />{{ t('finance.newSale') }}</button>
    </PageHeader>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>
    <div v-if="notice" class="alert success">
      <AppIcon name="check" />{{ t('finance.saleRecorded', { receipt: notice.receipt_number, amount: money(notice.total) }) }}
      <a :href="receiptUrl(notice.id)" target="_blank" class="link" style="margin-left: auto">{{ t('finance.printReceipt') }}</a>
    </div>

    <div class="card">
      <div class="toolbar filters">
        <label class="search">
          <AppIcon name="search" size="16" />
          <input v-model="search" type="search" :placeholder="t('finance.searchSales')" />
        </label>
        <label class="inline-field"><span class="muted small">{{ t('common.from') }}</span><input v-model="filters.from" type="date" /></label>
        <label class="inline-field"><span class="muted small">{{ t('common.to') }}</span><input v-model="filters.to" type="date" /></label>
        <select v-model="filters.method" :aria-label="t('common.method')">
          <option value="">{{ t('finance.allMethods') }}</option>
          <option v-for="m in METHODS" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
        <select v-model="filters.academic_year" :aria-label="t('common.academicYear')">
          <option value="">{{ t('finance.allYears') }}</option>
          <option v-for="y in years" :key="y.id" :value="y.name">{{ y.name }}</option>
        </select>
        <span class="journal-total">{{ t('common.total') }} <b>{{ money(meta.sum ?? 0) }}</b></span>
      </div>

      <div class="table-wrap" :class="{ 'is-loading': loading && items.length }">
        <table class="table">
          <thead><tr><th>{{ t('finance.receipt') }}</th><th>{{ t('common.date') }}</th><th>{{ t('finance.buyer') }}</th><th>{{ t('finance.items') }}</th><th>{{ t('common.method') }}</th><th class="num">{{ t('common.total') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="s in items" :key="s.id" :class="{ voided: s.voided }">
              <td><span class="mono">{{ s.receipt_number }}</span><div v-if="s.voided"><StatusBadge value="voided" :label="t('finance.voidedX', { reason: s.void_reason })" /></div></td>
              <td>{{ fmtDate(s.sold_at) }}</td>
              <td>
                <RouterLink v-if="s.student_id" :to="`/students/${s.student_id}`" class="strong link">{{ s.buyer }}</RouterLink>
                <span v-else class="strong">{{ s.buyer }}</span>
                <div class="muted small">{{ s.matricule ?? t('finance.otherBuyer') }}</div>
              </td>
              <td class="small wrap summary-cell">{{ s.summary }}</td>
              <td>{{ methodLabel(s.method) }}<div v-if="s.reference" class="muted small">{{ s.reference }}</div></td>
              <td class="num strong">{{ money(s.total) }}</td>
              <td class="right">
                <div class="row-actions">
                  <a :href="receiptUrl(s.id)" target="_blank" class="icon-btn" :title="t('finance.printReceipt')"><AppIcon name="printer" size="16" /></a>
                  <button v-if="!s.voided && can('sales:void')" class="icon-btn danger" :title="t('finance.voidSale')" @click="voidSale(s)"><AppIcon name="ban" size="16" /></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!loading && !items.length" class="empty"><AppIcon name="inbox" size="32" /><p>{{ t('finance.noSale') }}</p></div>
      </div>
      <PaginationBar v-if="total" v-model:page="page" v-model:page-size="pageSize" :total="total" :total-pages="totalPages" />
    </div>

    <SlideOver v-if="selling" :title="t('finance.newSale')" @close="selling = false">
      <SaleForm ref="form" @saved="saved" />
      <template #footer>
        <span class="muted" style="margin-right: auto">{{ t('common.total') }} <b>{{ money(form?.total ?? 0) }}</b></span>
        <button class="btn secondary" @click="selling = false">{{ t('common.cancel') }}</button>
        <button type="submit" form="sale-form" class="btn primary" :disabled="!form?.canSubmit">{{ form?.saving ? t('common.saving') : t('finance.recordSale') }}</button>
      </template>
    </SlideOver>
  </section>
</template>
