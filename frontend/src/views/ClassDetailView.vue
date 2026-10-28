<script setup>
import { ref, computed, onMounted } from 'vue';
import { classesApi, coursesApi, teachersApi } from '../api/http';
import PageHeader from '../components/PageHeader.vue';
import StatusBadge from '../components/StatusBadge.vue';
import Avatar from '../components/Avatar.vue';
import AppIcon from '../components/AppIcon.vue';
import PaginationBar from '../components/PaginationBar.vue';
import { usePaginatedList } from '../composables/usePaginatedList';

const props = defineProps({ id: String }); // injected from the route via `props: true`

const cls = ref(null);
const courses = ref([]);
const allCourses = ref([]);
const teachers = ref([]);
const assign = ref({ course_id: '', teacher_id: '' });
const error = ref('');

// Roster is paginated server-side like the other lists
const { items: students, total: studentTotal, totalPages, page, pageSize, loading: rosterLoading } =
  usePaginatedList((params) => classesApi.students(props.id, params));

const totalHours = computed(() => courses.value.reduce((sum, c) => sum + c.hours_per_week, 0));

async function load() {
  // Promise.all runs the requests in parallel
  [cls.value, courses.value] = await Promise.all([classesApi.get(props.id), classesApi.courses(props.id)]);
}

onMounted(async () => {
  [allCourses.value, teachers.value] = await Promise.all([coursesApi.list(), teachersApi.list()]);
  await load();
});

async function assignCourse() {
  error.value = '';
  try {
    await classesApi.assignCourse(props.id, { course_id: assign.value.course_id, teacher_id: assign.value.teacher_id || null });
    assign.value = { course_id: '', teacher_id: '' };
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

async function unassign(courseId) {
  await classesApi.unassignCourse(props.id, courseId);
  await load();
}
</script>

<template>
  <section v-if="cls">
    <PageHeader :title="cls.name" :subtitle="`${cls.level} · ${cls.academic_year}`" :back="{ to: '/classes', label: 'Classes' }" />
    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>

    <div class="stats">
      <div class="card stat"><span class="stat-icon"><AppIcon name="students" size="22" /></span>
        <div><p class="muted small">Students</p><p class="stat-value">{{ studentTotal }} <small>/ {{ cls.capacity }}</small></p></div></div>
      <div class="card stat"><span class="stat-icon"><AppIcon name="courses" size="22" /></span>
        <div><p class="muted small">Courses</p><p class="stat-value">{{ courses.length }}</p></div></div>
      <div class="card stat"><span class="stat-icon"><AppIcon name="registrations" size="22" /></span>
        <div><p class="muted small">Hours / week</p><p class="stat-value">{{ totalHours }}</p></div></div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-header"><h2>Courses &amp; teachers</h2></div>
        <form class="inline-form" @submit.prevent="assignCourse">
          <select v-model="assign.course_id" required>
            <option value="">Course…</option>
            <option v-for="c in allCourses" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <select v-model="assign.teacher_id">
            <option value="">Teacher…</option>
            <option v-for="t in teachers" :key="t.id" :value="t.id">{{ t.first_name }} {{ t.last_name }}</option>
          </select>
          <button type="submit" class="btn primary"><AppIcon name="plus" />Assign</button>
        </form>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Course</th><th>Coef.</th><th>Teacher</th><th></th></tr></thead>
            <tbody>
              <tr v-for="c in courses" :key="c.id">
                <td><div class="strong">{{ c.name }}</div><div class="muted small">{{ c.code }} · {{ c.hours_per_week }} h/week</div></td>
                <td>{{ c.coefficient }}</td>
                <td>{{ c.teacher ?? '—' }}</td>
                <td class="right"><button class="icon-btn danger" title="Remove" @click="unassign(c.id)"><AppIcon name="trash" size="16" /></button></td>
              </tr>
            </tbody>
          </table>
          <div v-if="!courses.length" class="empty"><p>No course assigned yet.</p></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h2>Students</h2><RouterLink to="/registrations" class="link">Register a student</RouterLink></div>
        <ul class="list">
          <li v-for="s in students" :key="s.id">
            <RouterLink :to="`/students/${s.id}`" class="identity">
              <Avatar :name="`${s.first_name} ${s.last_name}`" :src="s.photo_url" />
              <div><div class="strong">{{ s.last_name }} {{ s.first_name }}</div><div class="muted small">{{ s.matricule }}</div></div>
            </RouterLink>
            <StatusBadge :value="s.registration_status" />
          </li>
          <li v-if="!rosterLoading && !students.length" class="muted">No students registered.</li>
        </ul>
        <PaginationBar v-if="studentTotal > pageSize" v-model:page="page" v-model:page-size="pageSize" :total="studentTotal" :total-pages="totalPages" />
      </div>
    </div>
  </section>
</template>
