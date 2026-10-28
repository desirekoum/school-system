<script setup>
import { ref, computed, onMounted } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import AppIcon from '../components/AppIcon.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { studentsApi, teachersApi, classesApi, coursesApi, registrationsApi } from '../api/http';

const data = ref({ students: [], teachers: [], classes: [], courses: [], registrations: [] });
const loaded = ref(false);

onMounted(async () => {
  const [students, teachers, classes, courses, registrations] = await Promise.all([
    studentsApi.list(), teachersApi.list(), classesApi.list(), coursesApi.list(), registrationsApi.list(),
  ]);
  data.value = { students, teachers, classes, courses, registrations };
  loaded.value = true;
});

const stats = computed(() => [
  { label: 'Active students', value: data.value.students.filter((s) => s.status === 'active').length, icon: 'students', to: '/students' },
  { label: 'Active teachers', value: data.value.teachers.filter((t) => t.status === 'active').length, icon: 'teachers', to: '/teachers' },
  { label: 'Classes', value: data.value.classes.length, icon: 'classes', to: '/classes' },
  { label: 'Courses', value: data.value.courses.length, icon: 'courses', to: '/courses' },
]);

const pending = computed(() => data.value.registrations.filter((r) => r.status === 'pending'));
const recent = computed(() => data.value.registrations.slice(0, 6));

// Fill rate per class, for the capacity bars
const occupancy = computed(() =>
  data.value.classes.map((c) => ({ ...c, pct: Math.min(100, Math.round((c.enrolled / c.capacity) * 100)) })));
</script>

<template>
  <section>
    <PageHeader title="Dashboard" subtitle="Overview of your school at a glance." />

    <div class="stats">
      <RouterLink v-for="s in stats" :key="s.label" :to="s.to" class="card stat">
        <span class="stat-icon"><AppIcon :name="s.icon" size="22" /></span>
        <div>
          <p class="muted small">{{ s.label }}</p>
          <p class="stat-value">{{ loaded ? s.value : '–' }}</p>
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
        <p v-if="pending.length" class="card-foot">
          <AppIcon name="alert" size="16" /> {{ pending.length }} registration{{ pending.length > 1 ? 's' : '' }} waiting for confirmation
        </p>
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
