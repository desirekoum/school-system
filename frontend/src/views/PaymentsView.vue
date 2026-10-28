<script setup>
import { ref, onMounted } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import StatusBadge from '../components/StatusBadge.vue';
import AppIcon from '../components/AppIcon.vue';
import PaginationBar from '../components/PaginationBar.vue';
import { financesApi, academicYearsApi } from '../api/http';
import { usePaginatedList } from '../composables/usePaginatedList';
import { money, METHODS, methodLabel } from '../config/finance';

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

// CSV export of the whole filtered journal (not just the current page), opened by Excel / LibreOffice
const exporting = ref(false);
async function exportCsv() {
  exporting.value = true;
  try {
    const rows = await financesApi.payments({ ...filters, search: search.value || undefined });
    const cols = [['receipt_number', 'Receipt'], ['paid_at', 'Date'], ['student', 'Student'], ['matricule', 'Matricule'], ['class_name', 'Class'],
      ['academic_year', 'Year'], ['method', 'Method'], ['reference', 'Reference'], ['amount', 'Amount (FCFA)'], ['received_by', 'Received by'], ['voided', 'Voided']];
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.map(([, h]) => cell(h)).join(';'), ...rows.map((r) => cols.map(([k]) => cell(k === 'method' ? methodLabel(r[k]) : r[k])).join(';'))].join('\r\n');
    // BOM so Excel reads the accents (é, è) as UTF-8
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    Object.assign(document.createElement('a'), { href: url, download: `payments-${filters.from || 'all'}-${filters.to || 'all'}.csv` }).click();
    URL.revokeObjectURL(url);
  } catch (e) {
    error.value = e.message;
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <section>
    <PageHeader title="Payments" subtitle="Journal of every tuition payment received, with its receipt.">
      <button class="btn secondary" :disabled="exporting" @click="exportCsv"><AppIcon name="download" />Export CSV</button>
    </PageHeader>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>

    <div class="card">
      <div class="toolbar">
        <div class="segmented" style="margin: 0">
          <button v-for="r in [['', 'All'], ['today', 'Today'], ['week', 'This week'], ['month', 'This month']]" :key="r[0]" type="button" @click="range(r[0])">{{ r[1] }}</button>
        </div>
        <label class="search">
          <AppIcon name="search" size="16" />
          <input v-model="search" type="search" placeholder="Receipt, student, reference…" />
        </label>
      </div>
      <div class="toolbar filters">
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
        <select v-model="filters.voided" aria-label="Voided">
          <option value="">Valid and voided</option>
          <option value="false">Valid only</option>
          <option value="true">Voided only</option>
        </select>
        <span class="journal-total">Total <b>{{ money(meta.sum ?? 0) }}</b></span>
      </div>

      <div class="table-wrap" :class="{ 'is-loading': loading && items.length }">
        <table class="table">
          <thead><tr><th>Receipt</th><th>Date</th><th>Student</th><th>Class</th><th>Method</th><th class="num">Amount</th><th>Received by</th><th /></tr></thead>
          <tbody>
            <tr v-for="p in items" :key="p.id" :class="{ voided: p.voided }">
              <td><span class="mono">{{ p.receipt_number }}</span><div v-if="p.voided"><StatusBadge value="voided" :label="`Voided: ${p.void_reason}`" /></div></td>
              <td>{{ new Date(p.paid_at).toLocaleDateString() }}</td>
              <td><RouterLink :to="`/students/${p.student_id}`" class="strong link">{{ p.student }}</RouterLink><div class="muted small">{{ p.matricule }}</div></td>
              <td>{{ p.class_name }}</td>
              <td>{{ methodLabel(p.method) }}<div v-if="p.reference" class="muted small">{{ p.reference }}</div></td>
              <td class="num strong">{{ money(p.amount) }}</td>
              <td class="muted small">{{ p.received_by ?? '—' }}</td>
              <td class="right"><a :href="`/finances/receipts/${p.id}`" target="_blank" class="icon-btn" title="Print receipt"><AppIcon name="printer" size="16" /></a></td>
            </tr>
          </tbody>
        </table>
        <div v-if="!loading && !items.length" class="empty"><AppIcon name="inbox" size="32" /><p>No payment in this period.</p></div>
      </div>
      <PaginationBar v-if="total" v-model:page="page" v-model:page-size="pageSize" :total="total" :total-pages="totalPages" />
    </div>
  </section>
</template>
