<script setup>
import { ref, computed, onMounted } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import AppIcon from '../components/AppIcon.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { studentsApi, teachersApi, classesApi, coursesApi, registrationsApi } from '../api/http';

const totals = ref({});
const recent = ref([]);
const counts = ref({});
const classes = ref([]);
const loaded = ref(false);

// pageSize=1 gives the total count without downloading the whole table
const countOf = (api, filters = {}) => api.list({ page: 1, pageSize: 1, ...filters }).then((r) => r.total);

onMounted(async () => {
  const [students, teachers, courses, regs, cls] = await Promise.all([
    countOf(studentsApi, { status: 'active' }),
    countOf(teachersApi, { status: 'active' }),
    countOf(coursesApi),
    registrationsApi.list({ page: 1, pageSize: 6 }),
    classesApi.list(),
  ]);
  totals.value = { students, teachers, courses };
  recent.value = regs.data;
  counts.value = regs.counts;
  classes.value = cls;
  loaded.value = true;
});

const stats = computed(() => [
  { label: 'Active students', value: totals.value.students, icon: 'students', to: '/students' },
  { label: 'Active teachers', value: totals.value.teachers, icon: 'teachers', to: '/teachers' },
  { label: 'Classes', value: classes.value.length, icon: 'classes', to: '/classes' },
  { label: 'Courses', value: totals.value.courses, icon: 'courses', to: '/courses' },
]);

const pending = computed(() => counts.value.pending ?? 0);

// Fill rate per class, for the capacity bars
const occupancy = computed(() =>
  classes.value.map((c) => ({ ...c, pct: Math.min(100, Math.round((c.enrolled / c.capacity) * 100)) })));
</script>

<template>
  <section>
    <PageHeader title="Dashboard" subtitle="Overview of your school at a glance." />

    <div class="stats">
      <RouterLink v-for="s in stats" :key="s.label" :to="s.to" class="card stat">
        <span class="stat-icon"><AppIcon :name="s.icon" size="22" /></span>
        <div>
          <p class="muted small">{{ s.label }}</p>
          <p class="stat-value">{{ loaded ? s.value.toLocaleString() : '–' }}</p>
        </div>
      </RouterLink>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-header">
          <h2>Recent registrations</h2>
          <RouterLink to="/registrations" class="link">View all</RouterLink>
        </div>
        <ul class="list">
          <li v-for="r in recent" :key="r.id">
            <div>
              <p class="strong">{{ r.student }}</p>
              <p class="muted small">{{ r.class_name }} · {{ new Date(r.registered_at).toLocaleDateString() }}</p>
            </div>
            <StatusBadge :value="r.status" />
          </li>
          <li v-if="loaded && !recent.length" class="muted">No registrations yet.</li>
        </ul>
        <RouterLink v-if="pending" to="/registrations" class="card-foot">
          <AppIcon name="alert" size="16" /> {{ pending }} registration{{ pending > 1 ? 's' : '' }} waiting for confirmation
        </RouterLink>
      </div>

      <div class="card">
        <div class="card-header">
          <h2>Class occupancy</h2>
          <RouterLink to="/classes" class="link">Manage</RouterLink>
        </div>
        <ul class="list">
          <li v-for="c in occupancy" :key="c.id" class="occupancy">
            <div class="occupancy-head">
              <RouterLink :to="`/classes/${c.id}`" class="strong">{{ c.name }}</RouterLink>
              <span class="muted small">{{ c.enrolled }} / {{ c.capacity }}</span>
            </div>
            <div class="progress"><span :style="{ width: `${c.pct}%` }" :class="{ full: c.pct >= 100 }" /></div>
          </li>
          <li v-if="loaded && !occupancy.length" class="muted">No classes yet.</li>
        </ul>
      </div>
    </div>
  </section>
</template>
