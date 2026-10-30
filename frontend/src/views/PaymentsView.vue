<script setup>
import { ref, onMounted } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import StatusBadge from '../components/StatusBadge.vue';
import AppIcon from '../components/AppIcon.vue';
import PaginationBar from '../components/PaginationBar.vue';
import { financesApi, academicYearsApi } from '../api/http';
import { usePaginatedList } from '../composables/usePaginatedList';
import { money, METHODS, methodLabel } from '../config/finance';
import { exportRows } from '../utils/xlsx';
import ExportMenu from '../components/ExportMenu.vue';
import { t, fmtDate } from '../i18n';

const years = ref([]);
const { items, total, totalPages, page, pageSize, search, filters, loading, error, meta } = usePaginatedList(
  (params) => financesApi.payments(params),
  { filters: { academic_year: '', method: '', from: '', to: '', voided: '' } },
);
onMounted(async () => (years.value = await academicYearsApi.list()));

// Quick ranges for the cash journal
const iso = (d) => d.toISOString().slice(0, 10);
function range(kind) {
  const now = new Date();
  const start = { today: now, week: new Date(now - ((now.getDay() + 6) % 7) * 86400000), month: new Date(now.getFullYear(), now.getMonth(), 1) }[kind];
  filters.from = kind ? iso(start) : '';
  filters.to = kind ? iso(now) : '';
}

// CSV export of the whole filtered journal (not just the current page)
const exporting = ref(false);
async function exportList(format) {
  exporting.value = true;
  try {
    const rows = await financesApi.payments({ ...filters, search: search.value || undefined });
    await exportRows(format, `payments-${filters.from || 'all'}-${filters.to || 'all'}`, rows, [
      ['receipt_number', t('finance.receipt')], ['paid_at', t('common.date')], ['student', t('common.student')], ['matricule', t('fields.matricule')], ['class_name', t('common.class')],
      ['academic_year', t('common.year')], ['method', t('common.method'), methodLabel], ['reference', t('common.reference')], ['amount', t('finance.amountFcfa')],
      ['received_by', t('finance.receivedBy')], ['voided', t('finance.voided'), (v) => t(`common.${v ? 'yes' : 'no'}`)]]);
  } catch (e) {
    error.value = e.message;
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <section>
    <PageHeader :title="t('finance.paymentsTitle')" :subtitle="t('finance.paymentsSubtitle')">
      <ExportMenu :busy="exporting" @export="exportList" />
    </PageHeader>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>

    <div class="card">
      <div class="toolbar">
        <div class="segmented" style="margin: 0">
          <button v-for="r in ['', 'today', 'week', 'month']" :key="r" type="button" @click="range(r)">{{ t(`finance.ranges.${r || 'all'}`) }}</button>
        </div>
        <label class="search">
          <AppIcon name="search" size="16" />
          <input v-model="search" type="search" :placeholder="t('finance.searchPayments')" />
        </label>
      </div>
      <div class="toolbar filters">
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
        <select v-model="filters.voided" :aria-label="t('finance.voidedFilter')">
          <option value="">{{ t('finance.validAndVoided') }}</option>
          <option value="false">{{ t('finance.validOnly') }}</option>
          <option value="true">{{ t('finance.voidedOnly') }}</option>
        </select>
        <span class="journal-total">{{ t('common.total') }} <b>{{ money(meta.sum ?? 0) }}</b></span>
      </div>

      <div class="table-wrap" :class="{ 'is-loading': loading && items.length }">
        <table class="table">
          <thead><tr><th>{{ t('finance.receipt') }}</th><th>{{ t('common.date') }}</th><th>{{ t('common.student') }}</th><th>{{ t('common.class') }}</th><th>{{ t('common.method') }}</th><th class="num">{{ t('common.amount') }}</th><th>{{ t('finance.receivedBy') }}</th><th /></tr></thead>
          <tbody>
            <tr v-for="p in items" :key="p.id" :class="{ voided: p.voided }">
              <td><span class="mono">{{ p.receipt_number }}</span><div v-if="p.voided"><StatusBadge value="voided" :label="t('finance.voidedX', { reason: p.void_reason })" /></div></td>
              <td>{{ fmtDate(p.paid_at) }}</td>
              <td><RouterLink :to="`/students/${p.student_id}`" class="strong link">{{ p.student }}</RouterLink><div class="muted small">{{ p.matricule }}</div></td>
              <td>{{ p.class_name }}</td>
              <td>{{ methodLabel(p.method) }}<div v-if="p.reference" class="muted small">{{ p.reference }}</div></td>
              <td class="num strong">{{ money(p.amount) }}</td>
              <td class="muted small">{{ p.received_by ?? '—' }}</td>
              <td class="right"><a :href="`/finances/receipts/${p.id}`" target="_blank" class="icon-btn" :title="t('finance.printReceipt')"><AppIcon name="printer" size="16" /></a></td>
            </tr>
          </tbody>
        </table>
        <div v-if="!loading && !items.length" class="empty"><AppIcon name="inbox" size="32" /><p>{{ t('finance.noPaymentPeriod') }}</p></div>
      </div>
      <PaginationBar v-if="total" v-model:page="page" v-model:page-size="pageSize" :total="total" :total-pages="totalPages" />
    </div>
  </section>
</template>
