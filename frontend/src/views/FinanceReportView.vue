<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import StatusBadge from '../components/StatusBadge.vue';
import AppIcon from '../components/AppIcon.vue';
import { financesApi, academicYearsApi } from '../api/http';
import { money, compact, methodLabel, PLAN_STATUSES, shortCategory } from '../config/finance';
import { t, fmtDate } from '../i18n';

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

const tot = computed(() => r.value?.totals ?? {});
const cards = computed(() => [
  { label: t('reports.expected'), value: money(tot.value.expected), sub: t('reports.registrationsN', { n: tot.value.registrations ?? 0 }), icon: 'wallet' },
  { label: t('reports.collected'), value: money(tot.value.collected), sub: t('reports.ofExpected', { n: tot.value.collection_rate ?? 0 }), icon: 'check', tone: 'score-pass' },
  { label: t('reports.outstanding'), value: money(tot.value.outstanding), sub: t('reports.withBalance', { n: (tot.value.partial_count ?? 0) + (tot.value.unpaid_count ?? 0) }), icon: 'clock' },
  { label: t('reports.overdue'), value: money(tot.value.overdue), sub: t('reports.late', { n: tot.value.overdue_count ?? 0 }), icon: 'alert', tone: tot.value.overdue ? 'score-fail' : '' },
]);

// Who has paid: one stacked bar, status colors, always labelled (never color alone)
const statusParts = computed(() => {
  const n = tot.value.registrations || 1;
  return [
    { key: 'paid', label: t('reports.paidFull'), count: tot.value.paid_count, tone: 'success' },
    { key: 'partial', label: t('reports.partial'), count: tot.value.partial_count, tone: 'warning' },
    { key: 'unpaid', label: t('reports.nothing'), count: tot.value.unpaid_count, tone: 'danger' },
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
    name: fmtDate(`${m.month}-01`, { month: 'short' }),
    full: fmtDate(`${m.month}-01`, { month: 'long', year: 'numeric' }),
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
    <PageHeader :title="t('reports.title')" :subtitle="t('reports.subtitle', { year: year || '…' })">
      <select v-model="year" :aria-label="t('common.academicYear')" style="width: auto">
        <option v-for="y in years" :key="y.id" :value="y.name">{{ y.name }}</option>
      </select>
      <button class="btn secondary no-print" @click="print"><AppIcon name="printer" />{{ t('common.print') }}</button>
    </PageHeader>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>

    <template v-if="r">
      <div class="card cash-card" :class="{ 'is-loading': loading }">
        <div class="cash-cell"><span class="muted small">{{ t('reports.moneyIn') }}</span><b>{{ money(cash.income) }}</b>
          <span class="muted small">{{ t('reports.inDetail', { tuition: money(cash.tuition), sales: money(cash.sales) }) }}</span></div>
        <span class="cash-op" aria-hidden="true">−</span>
        <div class="cash-cell"><span class="muted small">{{ t('reports.moneyOut') }}</span><b>{{ money(cash.expenses) }}</b>
          <span class="muted small">{{ t('reports.expensesN', { n: cash.expenses_count }) }}</span></div>
        <span class="cash-op" aria-hidden="true">=</span>
        <div class="cash-cell net"><span class="muted small">{{ t('reports.net') }}</span>
          <b :class="cash.net >= 0 ? 'score-pass' : 'score-fail'">{{ money(cash.net) }}</b>
          <RouterLink to="/finances/expenses" class="link small no-print">{{ t('reports.seeExpenses') }}</RouterLink></div>
      </div>

      <h2 class="section-title">{{ t('reports.tuition') }}</h2>
      <div class="stats" :class="{ 'is-loading': loading }">
        <div v-for="c in cards" :key="c.label" class="card stat">
          <span class="stat-icon"><AppIcon :name="c.icon" size="22" /></span>
          <div><p class="muted small">{{ c.label }}</p><p class="stat-value money" :class="c.tone">{{ c.value }}</p><p class="muted small">{{ c.sub }}</p></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h2>{{ t('reports.paymentStatus') }}</h2>
          <span class="muted small">{{ t('reports.plans', { list: PLAN_STATUSES.map((p) => `${r.plans[p.value] ?? 0} ${t(`options.status.${p.value}`).toLowerCase()}`).join(' · ') }) }}</span></div>
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
          <div class="card-header"><h2>{{ t('reports.cashFlow') }}</h2>
            <ul class="legend inline"><li><i class="in" />{{ t('reports.moneyIn') }}</li><li><i class="out" />{{ t('reports.moneyOut') }}</li></ul></div>
          <div class="card-body">
            <div class="bar-chart">
              <div class="bar-axis muted small"><span>{{ compact(axisMax) }}</span><span>{{ compact(axisMax / 2) }}</span><span>0</span></div>
              <div class="bar-plot">
                <div v-for="m in months" :key="m.month" class="bar-col" tabindex="0" @mouseenter="hover = m" @mouseleave="hover = null" @focus="hover = m" @blur="hover = null"
                     :aria-label="t('reports.barAria', { month: m.full, in: money(m.income), out: money(m.expenses) })">
                  <div class="bar-pair">
                    <span class="bar in" :style="{ height: m.hIn + '%' }" />
                    <span class="bar out" :style="{ height: m.hOut + '%' }" />
                  </div>
                  <span class="bar-label muted small">{{ m.name }}</span>
                  <div v-if="hover === m" class="chart-tip">
                    <b>{{ m.full }}</b><br />
                    {{ t('reports.tipTuition', { n: money(m.tuition) }) }}<br />{{ t('reports.tipSales', { n: money(m.sales) }) }}<br />{{ t('reports.tipExpenses', { n: money(m.expenses) }) }}<br />
                    <b>{{ t('reports.tipNet', { n: money(m.net) }) }}</b>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h2>{{ t('reports.byMethod') }}</h2></div>
          <div class="card-body">
            <div v-for="m in methods" :key="m.method" class="hbar">
              <div class="hbar-text"><span>{{ methodLabel(m.method) }}</span><span><b>{{ money(m.total) }}</b> <span class="muted small">· {{ m.count }} · {{ Math.round(m.pct) }}%</span></span></div>
              <div class="progress"><span :style="{ width: m.pct + '%' }" /></div>
            </div>
            <p v-if="!methods.length" class="muted small">{{ t('reports.noPayment') }}</p>
          </div>
        </div>
      </div>

      <h2 class="section-title">{{ t('reports.shop') }}</h2>
      <div class="grid-2">
        <div class="card">
          <div class="card-header"><h2>{{ t('reports.byCategory') }}</h2><span class="muted small">{{ money(cash.expenses) }}</span></div>
          <div class="card-body">
            <div v-for="c in categories" :key="c.category" class="hbar">
              <div class="hbar-text"><span>{{ shortCategory(c.category) }}</span><span><b>{{ money(c.total) }}</b> <span class="muted small">· {{ c.count }} · {{ Math.round(c.pct) }}%</span></span></div>
              <div class="progress"><span class="out-bar" :style="{ width: c.pct + '%' }" /></div>
            </div>
            <p v-if="!categories.length" class="muted small">{{ t('reports.noExpense') }}</p>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h2>{{ t('reports.bestSellers') }}</h2><span class="muted small">{{ t('reports.salesSummary', { n: cash.sales_count, amount: money(cash.sales) }) }}</span></div>
          <div class="table-wrap">
            <table class="table compact">
              <thead><tr><th>{{ t('finance.item') }}</th><th class="num">{{ t('reports.sold') }}</th><th class="num">{{ t('reports.revenue') }}</th></tr></thead>
              <tbody>
                <tr v-for="i in r.top_items" :key="i.id"><td>{{ i.name }}<div class="muted small mono">{{ i.code }}</div></td>
                  <td class="num">{{ i.quantity }}</td><td class="num strong">{{ money(i.total) }}</td></tr>
              </tbody>
            </table>
            <div v-if="!r.top_items.length" class="empty"><p>{{ t('reports.noSale') }}</p></div>
          </div>
        </div>
      </div>

      <h2 class="section-title">{{ t('reports.details') }}</h2>
      <div class="card">
        <div class="card-header"><h2>{{ t('reports.byClass') }}</h2></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>{{ t('common.class') }}</th><th class="num">{{ t('reports.fee') }}</th><th class="num">{{ t('common.students') }}</th><th class="num">{{ t('reports.paidFull') }}</th><th class="num">{{ t('reports.expectedCol') }}</th><th class="num">{{ t('reports.collected') }}</th><th class="num">{{ t('reports.outstanding') }}</th><th>{{ t('reports.collectionRate') }}</th></tr></thead>
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
        <div class="card-header"><h2>{{ t('reports.largest') }}</h2><RouterLink to="/finances" class="link small no-print">{{ t('reports.allAccounts') }}</RouterLink></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>{{ t('common.student') }}</th><th>{{ t('common.class') }}</th><th class="num">{{ t('finance.paid') }}</th><th class="num">{{ t('finance.balance') }}</th><th class="num">{{ t('options.status.overdue') }}</th><th>{{ t('reports.nextDue') }}</th><th>{{ t('finance.plan') }}</th></tr></thead>
            <tbody>
              <tr v-for="d in r.debtors" :key="d.id">
                <td><div class="strong">{{ d.student }}</div><div class="muted small">{{ d.matricule }}</div></td>
                <td>{{ d.class_name }}</td>
                <td class="num">{{ money(d.paid) }}</td>
                <td class="num strong">{{ money(d.balance) }}</td>
                <td class="num" :class="{ 'score-fail': d.overdue }">{{ d.overdue ? money(d.overdue) : '—' }}</td>
                <td>{{ fmtDate(d.next_due_date) }}</td>
                <td><StatusBadge v-if="d.plan_status" :value="d.plan_status" /><span v-else class="muted small">{{ t('finance.fullPayment') }}</span></td>
              </tr>
            </tbody>
          </table>
          <div v-if="!r.debtors.length" class="empty"><p>{{ t('reports.allPaid') }}</p></div>
        </div>
      </div>
    </template>
    <div v-else-if="!error" class="card empty">{{ t('common.loading') }}</div>
  </section>
</template>
