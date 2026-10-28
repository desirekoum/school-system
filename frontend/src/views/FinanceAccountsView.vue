<script setup>
import { ref, computed, onMounted } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import SlideOver from '../components/SlideOver.vue';
import StatusBadge from '../components/StatusBadge.vue';
import Avatar from '../components/Avatar.vue';
import AppIcon from '../components/AppIcon.vue';
import PaginationBar from '../components/PaginationBar.vue';
import AccountPanel from '../components/AccountPanel.vue';
import { financesApi, classesApi, academicYearsApi } from '../api/http';
import { usePaginatedList } from '../composables/usePaginatedList';
import { money, PAYMENT_STATUSES, PLAN_STATUSES, label } from '../config/finance';

const classes = ref([]);
const years = ref([]);
const selected = ref(null); // registration id shown in the side panel

const { items, total, totalPages, page, pageSize, search, filters, loading, error, load } = usePaginatedList(
  (params) => financesApi.accounts(params),
  { filters: { academic_year: '', payment_status: '', plan_status: '', class_id: '', is_overdue: '' } },
);

onMounted(async () => {
  [classes.value, years.value] = await Promise.all([classesApi.list(), academicYearsApi.list()]);
  filters.academic_year = years.value.find((y) => y.is_current)?.name ?? '';
});
const yearClasses = computed(() => classes.value.filter((c) => !filters.academic_year || c.academic_year === filters.academic_year));

const tabs = [{ value: '', label: 'All' }, ...PAYMENT_STATUSES];
const pct = (a) => (a.fee ? Math.min(100, Math.round((a.paid / a.fee) * 100)) : 100);
</script>

<template>
  <section>
    <PageHeader title="Tuition & accounts" subtitle="What every registered student owes, has paid and still has to pay.">
      <RouterLink to="/finances/reports" class="btn secondary"><AppIcon name="chart" />Reports</RouterLink>
    </PageHeader>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>

    <div class="card">
      <div class="toolbar">
        <div class="tabs">
          <button v-for="t in tabs" :key="t.value" :class="['tab', { active: filters.payment_status === t.value }]" @click="filters.payment_status = t.value">{{ t.label }}</button>
        </div>
        <label class="search">
          <AppIcon name="search" size="16" />
          <input v-model="search" type="search" placeholder="Search student, matricule or class…" />
        </label>
      </div>
      <div class="toolbar filters">
        <select v-model="filters.academic_year" aria-label="Academic year">
          <option value="">All years</option>
          <option v-for="y in years" :key="y.id" :value="y.name">{{ y.name }}</option>
        </select>
        <select v-model="filters.class_id" aria-label="Class">
          <option value="">All classes</option>
          <option v-for="c in yearClasses" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <select v-model="filters.plan_status" aria-label="Instalment plan">
          <option value="">Any plan</option>
          <option v-for="p in PLAN_STATUSES" :key="p.value" :value="p.value">{{ p.label }}</option>
        </select>
        <label class="check"><input v-model="filters.is_overdue" type="checkbox" true-value="true" false-value="" /> Overdue only</label>
      </div>

      <div class="table-wrap" :class="{ 'is-loading': loading && items.length }">
        <table class="table">
          <thead><tr><th>Student</th><th>Class</th><th class="num">Tuition</th><th class="num">Paid</th><th class="num">Balance</th><th>Progress</th><th>Plan</th><th /></tr></thead>
          <tbody>
            <tr v-for="a in items" :key="a.id" class="clickable" @click="selected = a.id">
              <td>
                <div class="identity">
                  <Avatar :name="a.student" :src="a.photo_url" :size="30" />
                  <div><div class="strong">{{ a.student }}</div><div class="muted small">{{ a.matricule }}</div></div>
                </div>
              </td>
              <td>{{ a.class_name }}<div v-if="a.status === 'cancelled'"><StatusBadge value="cancelled" /></div></td>
              <td class="num">{{ money(a.fee) }}</td>
              <td class="num">{{ money(a.paid) }}</td>
              <td class="num"><b :class="{ 'score-fail': a.balance > 0 }">{{ money(a.balance) }}</b>
                <div v-if="a.overdue" class="small score-fail">{{ money(a.overdue) }} overdue</div></td>
              <td style="min-width: 120px">
                <div class="progress"><span class="paid-bar" :style="{ width: pct(a) + '%' }" /></div>
                <span class="muted small">{{ pct(a) }}%</span>
              </td>
              <td><StatusBadge v-if="a.plan_status" :value="a.plan_status" :label="label(PLAN_STATUSES, a.plan_status).replace('Plan ', '')" /><span v-else class="muted small">Full payment</span></td>
              <td class="right"><button class="btn secondary sm" @click.stop="selected = a.id"><AppIcon name="wallet" size="14" />Open</button></td>
            </tr>
          </tbody>
        </table>
        <div v-if="!loading && !items.length" class="empty"><AppIcon name="inbox" size="32" /><p>No account matches.</p></div>
      </div>
      <PaginationBar v-if="total" v-model:page="page" v-model:page-size="pageSize" :total="total" :total-pages="totalPages" />
    </div>

    <SlideOver v-if="selected" title="Tuition account" @close="selected = null">
      <AccountPanel :registration-id="selected" @changed="load" />
    </SlideOver>
  </section>
</template>
