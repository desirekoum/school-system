<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import StatusBadge from '../components/StatusBadge.vue';
import AppIcon from '../components/AppIcon.vue';
import { financesApi, academicYearsApi } from '../api/http';
import { money, compact, methodLabel, PLAN_STATUSES, label } from '../config/finance';

const years = ref([]);
const year = ref('');
const r = ref(null);
const loading = ref(false);
const error = ref('');

onMounted(async () => {
  years.value = await academicYearsApi.list();
  year.value = years.value.find((y) => y.is_current)?.name ?? years.value[0]?.name ?? '';
});
watch(year, async (y) => {
  loading.value = true;
  error.value = '';
  try {
    r.value = await financesApi.report(y);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

const t = computed(() => r.value?.totals ?? {});
const cards = computed(() => [
  { label: 'Expected tuition', value: money(t.value.expected), sub: `${t.value.registrations ?? 0} registrations`, icon: 'wallet' },
  { label: 'Collected', value: money(t.value.collected), sub: `${t.value.collection_rate ?? 0}% of expected`, icon: 'check', tone: 'score-pass' },
  { label: 'Outstanding', value: money(t.value.outstanding), sub: `${(t.value.partial_count ?? 0) + (t.value.unpaid_count ?? 0)} students with a balance`, icon: 'clock' },
  { label: 'Overdue instalments', value: money(t.value.overdue), sub: `${t.value.overdue_count ?? 0} students late`, icon: 'alert', tone: t.value.overdue ? 'score-fail' : '' },
]);

// Who has paid: one stacked bar, status colors, always labelled (never color alone)
const statusParts = computed(() => {
  const n = t.value.registrations || 1;
  return [
    { key: 'paid', label: 'Paid in full', count: t.value.paid_count, tone: 'success' },
    { key: 'partial', label: 'Partially paid', count: t.value.partial_count, tone: 'warning' },
    { key: 'unpaid', label: 'Nothing paid', count: t.value.unpaid_count, tone: 'danger' },
  ].map((p) => ({ ...p, pct: ((p.count ?? 0) / n) * 100 }));
});

// Monthly collections: single series, so one hue and no legend; values on hover + in the tooltip
const months = computed(() => {
  const list = r.value?.monthly ?? [];
  const max = Math.max(1, ...list.map((m) => m.total));
  return list.map((m) => ({
    ...m,
    h: (m.total / max) * 100,
    name: new Date(`${m.month}-01`).toLocaleDateString(undefined, { month: 'short' }),
    full: new Date(`${m.month}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
  }));
});
const axisMax = computed(() => Math.max(0, ...months.value.map((m) => m.total)));
const hover = ref(null);

const methods = computed(() => {
  const list = r.value?.by_method ?? [];
  const sum = list.reduce((s, m) => s + m.total, 0) || 1;
  return list.map((m) => ({ ...m, pct: (m.total / sum) * 100 }));
});
const rate = (c) => (c.expected ? Math.round((c.collected / c.expected) * 100) : 0);
const print = () => window.print();
</script>

<template>
  <section>
    <PageHeader title="Financial reports" :subtitle="`Tuition collection for ${year || '…'}`">
      <select v-model="year" aria-label="Academic year" style="width: auto">
        <option v-for="y in years" :key="y.id" :value="y.name">{{ y.name }}</option>
      </select>
      <button class="btn secondary no-print" @click="print"><AppIcon name="printer" />Print</button>
    </PageHeader>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>

    <template v-if="r">
      <div class="stats" :class="{ 'is-loading': loading }">
        <div v-for="c in cards" :key="c.label" class="card stat">
          <span class="stat-icon"><AppIcon :name="c.icon" size="22" /></span>
          <div><p class="muted small">{{ c.label }}</p><p class="stat-value money" :class="c.tone">{{ c.value }}</p><p class="muted small">{{ c.sub }}</p></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h2>Payment status</h2>
          <span class="muted small">Plans: {{ PLAN_STATUSES.map((p) => `${r.plans[p.value] ?? 0} ${label(PLAN_STATUSES, p.value).replace('Plan ', '')}`).join(' · ') }}</span></div>
        <div class="card-body">
          <div class="stacked-bar" role="img" :aria-label="statusParts.map((p) => `${p.label}: ${p.count}`).join(', ')">
            <span v-for="p in statusParts" :key="p.key" :class="p.tone" :style="{ width: p.pct + '%' }" :title="`${p.label}: ${p.count}`" />
          </div>
          <ul class="legend">
            <li v-for="p in statusParts" :key="p.key"><i :class="p.tone" />{{ p.label }} <b>{{ p.count }}</b> <span class="muted">({{ Math.round(p.pct) }}%)</span></li>
          </ul>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header"><h2>Collections per month</h2></div>
          <div class="card-body">
            <div class="bar-chart">
              <div class="bar-axis muted small"><span>{{ compact(axisMax) }}</span><span>{{ compact(axisMax / 2) }}</span><span>0</span></div>
              <div class="bar-plot">
                <div v-for="m in months" :key="m.month" class="bar-col" @mouseenter="hover = m" @mouseleave="hover = null" @focus="hover = m" @blur="hover = null" tabindex="0"
                     :aria-label="`${m.full}: ${money(m.total)}`">
                  <span class="bar" :style="{ height: m.h + '%' }" />
                  <span class="bar-label muted small">{{ m.name }}</span>
                  <div v-if="hover === m" class="chart-tip"><b>{{ m.full }}</b><br />{{ money(m.total) }}<br /><span class="muted">{{ m.count }} payments</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h2>By payment method</h2></div>
          <div class="card-body">
            <div v-for="m in methods" :key="m.method" class="hbar">
              <div class="hbar-text"><span>{{ methodLabel(m.method) }}</span><span><b>{{ money(m.total) }}</b> <span class="muted small">· {{ m.count }} · {{ Math.round(m.pct) }}%</span></span></div>
              <div class="progress"><span :style="{ width: m.pct + '%' }" /></div>
            </div>
            <p v-if="!methods.length" class="muted small">No payment yet.</p>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h2>By class</h2></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Class</th><th class="num">Fee</th><th class="num">Students</th><th class="num">Paid in full</th><th class="num">Expected</th><th class="num">Collected</th><th class="num">Outstanding</th><th>Collection rate</th></tr></thead>
            <tbody>
              <tr v-for="c in r.by_class" :key="c.id">
                <td><RouterLink :to="`/classes/${c.id}`" class="strong link">{{ c.name }}</RouterLink></td>
                <td class="num">{{ money(c.tuition_fee) }}</td>
                <td class="num">{{ c.students }}</td>
                <td class="num">{{ c.paid_count }}</td>
                <td class="num">{{ money(c.expected) }}</td>
                <td class="num">{{ money(c.collected) }}</td>
                <td class="num">{{ money(c.outstanding) }}</td>
                <td style="min-width: 140px"><div class="progress"><span class="paid-bar" :style="{ width: rate(c) + '%' }" /></div><span class="muted small">{{ rate(c) }}%</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h2>Largest balances</h2><RouterLink to="/finances" class="link small no-print">All accounts</RouterLink></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Student</th><th>Class</th><th class="num">Paid</th><th class="num">Balance</th><th class="num">Overdue</th><th>Next due</th><th>Plan</th></tr></thead>
            <tbody>
              <tr v-for="d in r.debtors" :key="d.id">
                <td><div class="strong">{{ d.student }}</div><div class="muted small">{{ d.matricule }}</div></td>
                <td>{{ d.class_name }}</td>
                <td class="num">{{ money(d.paid) }}</td>
                <td class="num strong">{{ money(d.balance) }}</td>
                <td class="num" :class="{ 'score-fail': d.overdue }">{{ d.overdue ? money(d.overdue) : '—' }}</td>
                <td>{{ d.next_due_date ? new Date(d.next_due_date).toLocaleDateString() : '—' }}</td>
                <td><StatusBadge v-if="d.plan_status" :value="d.plan_status" /><span v-else class="muted small">Full payment</span></td>
              </tr>
            </tbody>
          </table>
          <div v-if="!r.debtors.length" class="empty"><p>Every student has paid. 🎉</p></div>
        </div>
      </div>
    </template>
    <div v-else-if="!error" class="card empty">Loading…</div>
  </section>
</template>
