<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import StatusBadge from '../components/StatusBadge.vue';
import AppIcon from '../components/AppIcon.vue';
import { financesApi, academicYearsApi } from '../api/http';
import { money, compact, methodLabel, PLAN_STATUSES, label, shortCategory } from '../config/finance';

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

// Cash flow per month: two series (money in = tuition + sales, money out = expenses) on one axis,
// each with its own color + a legend; the tooltip gives the breakdown and the net
const months = computed(() => {
  const list = (r.value?.monthly ?? []).map((m) => ({ ...m, income: m.tuition + m.sales }));
  const max = Math.max(1, ...list.flatMap((m) => [m.income, m.expenses]));
  return list.map((m) => ({
    ...m,
    hIn: (m.income / max) * 100,
    hOut: (m.expenses / max) * 100,
    net: m.income - m.expenses,
    name: new Date(`${m.month}-01`).toLocaleDateString(undefined, { month: 'short' }),
    full: new Date(`${m.month}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
  }));
});
const axisMax = computed(() => Math.max(0, ...months.value.flatMap((m) => [m.income, m.expenses])));
const cash = computed(() => r.value?.cash ?? {});
const categories = computed(() => {
  const list = r.value?.by_category ?? [];
  const sum = list.reduce((a, c) => a + c.total, 0) || 1;
  return list.map((c) => ({ ...c, pct: (c.total / sum) * 100 }));
});
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
    <PageHeader title="Financial reports" :subtitle="`Money in and out for ${year || '…'}`">
      <select v-model="year" aria-label="Academic year" style="width: auto">
        <option v-for="y in years" :key="y.id" :value="y.name">{{ y.name }}</option>
      </select>
      <button class="btn secondary no-print" @click="print"><AppIcon name="printer" />Print</button>
    </PageHeader>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>

    <template v-if="r">
      <div class="card cash-card" :class="{ 'is-loading': loading }">
        <div class="cash-cell"><span class="muted small">Money in</span><b>{{ money(cash.income) }}</b>
          <span class="muted small">Tuition {{ money(cash.tuition) }} · Sales {{ money(cash.sales) }}</span></div>
        <span class="cash-op" aria-hidden="true">−</span>
        <div class="cash-cell"><span class="muted small">Money out</span><b>{{ money(cash.expenses) }}</b>
          <span class="muted small">{{ cash.expenses_count }} expenses</span></div>
        <span class="cash-op" aria-hidden="true">=</span>
        <div class="cash-cell net"><span class="muted small">Net cash for the year</span>
          <b :class="cash.net >= 0 ? 'score-pass' : 'score-fail'">{{ money(cash.net) }}</b>
          <RouterLink to="/finances/expenses" class="link small no-print">See expenses</RouterLink></div>
      </div>

      <h2 class="section-title">Tuition</h2>
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
          <div class="card-header"><h2>Cash flow per month</h2>
            <ul class="legend inline"><li><i class="in" />Money in</li><li><i class="out" />Money out</li></ul></div>
          <div class="card-body">
            <div class="bar-chart">
              <div class="bar-axis muted small"><span>{{ compact(axisMax) }}</span><span>{{ compact(axisMax / 2) }}</span><span>0</span></div>
              <div class="bar-plot">
                <div v-for="m in months" :key="m.month" class="bar-col" tabindex="0" @mouseenter="hover = m" @mouseleave="hover = null" @focus="hover = m" @blur="hover = null"
                     :aria-label="`${m.full}: in ${money(m.income)}, out ${money(m.expenses)}`">
                  <div class="bar-pair">
                    <span class="bar in" :style="{ height: m.hIn + '%' }" />
                    <span class="bar out" :style="{ height: m.hOut + '%' }" />
                  </div>
                  <span class="bar-label muted small">{{ m.name }}</span>
                  <div v-if="hover === m" class="chart-tip">
                    <b>{{ m.full }}</b><br />
                    Tuition {{ money(m.tuition) }}<br />Sales {{ money(m.sales) }}<br />Expenses {{ money(m.expenses) }}<br />
                    <b>Net {{ money(m.net) }}</b>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h2>Tuition by payment method</h2></div>
          <div class="card-body">
            <div v-for="m in methods" :key="m.method" class="hbar">
              <div class="hbar-text"><span>{{ methodLabel(m.method) }}</span><span><b>{{ money(m.total) }}</b> <span class="muted small">· {{ m.count }} · {{ Math.round(m.pct) }}%</span></span></div>
              <div class="progress"><span :style="{ width: m.pct + '%' }" /></div>
            </div>
            <p v-if="!methods.length" class="muted small">No payment yet.</p>
          </div>
        </div>
      </div>

      <h2 class="section-title">Shop and expenses</h2>
      <div class="grid-2">
        <div class="card">
          <div class="card-header"><h2>Expenses by category</h2><span class="muted small">{{ money(cash.expenses) }}</span></div>
          <div class="card-body">
            <div v-for="c in categories" :key="c.category" class="hbar">
              <div class="hbar-text"><span>{{ shortCategory(c.category) }}</span><span><b>{{ money(c.total) }}</b> <span class="muted small">· {{ c.count }} · {{ Math.round(c.pct) }}%</span></span></div>
              <div class="progress"><span class="out-bar" :style="{ width: c.pct + '%' }" /></div>
            </div>
            <p v-if="!categories.length" class="muted small">No expense yet.</p>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h2>Best-selling items</h2><span class="muted small">{{ cash.sales_count }} sales · {{ money(cash.sales) }}</span></div>
          <div class="table-wrap">
            <table class="table compact">
              <thead><tr><th>Item</th><th class="num">Sold</th><th class="num">Revenue</th></tr></thead>
              <tbody>
                <tr v-for="i in r.top_items" :key="i.id"><td>{{ i.name }}<div class="muted small mono">{{ i.code }}</div></td>
                  <td class="num">{{ i.quantity }}</td><td class="num strong">{{ money(i.total) }}</td></tr>
              </tbody>
            </table>
            <div v-if="!r.top_items.length" class="empty"><p>No sale yet.</p></div>
          </div>
        </div>
      </div>

      <h2 class="section-title">Tuition details</h2>
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
