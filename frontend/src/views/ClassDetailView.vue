<script setup>
import { ref, onMounted } from 'vue';
import { classesApi, coursesApi, teachersApi } from '../api/http';

const props = defineProps({ id: String }); // injected from the route via `props: true`

const cls = ref(null);
const courses = ref([]);
const students = ref([]);
const allCourses = ref([]);
const teachers = ref([]);
const assign = ref({ course_id: '', teacher_id: '' });
const error = ref('');

async function load() {
  // Promise.all runs the requests in parallel
  [cls.value, courses.value, students.value] = await Promise.all([
    classesApi.get(props.id), classesApi.courses(props.id), classesApi.students(props.id),
  ]);
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
    <RouterLink to="/classes">← Classes</RouterLink>
    <h1>{{ cls.name }} <small>{{ cls.level }} · {{ cls.academic_year }}</small></h1>
    <p v-if="error" class="error">{{ error }}</p>

    <h2>Courses</h2>
    <form class="row card form" @submit.prevent="assignCourse">
      <select v-model="assign.course_id" required>
        <option value="">Course…</option>
        <option v-for="c in allCourses" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <select v-model="assign.teacher_id">
        <option value="">Teacher…</option>
        <option v-for="t in teachers" :key="t.id" :value="t.id">{{ t.first_name }} {{ t.last_name }}</option>
      </select>
      <button type="submit">Assign</button>
    </form>
    <table class="card">
      <thead><tr><th>Code</th><th>Course</th><th>Coef.</th><th>Teacher</th><th></th></tr></thead>
      <tbody>
        <tr v-for="c in courses" :key="c.id">
          <td>{{ c.code }}</td><td>{{ c.name }}</td><td>{{ c.coefficient }}</td><td>{{ c.teacher ?? '—' }}</td>
          <td class="actions"><button class="danger" @click="unassign(c.id)">Remove</button></td>
        </tr>
      </tbody>
    </table>

    <h2>Students ({{ students.length }} / {{ cls.capacity }})</h2>
    <table class="card">
      <thead><tr><th>Matricule</th><th>Name</th><th>Status</th></tr></thead>
      <tbody>
        <tr v-for="s in students" :key="s.id">
          <td>{{ s.matricule }}</td><td>{{ s.last_name }} {{ s.first_name }}</td>
          <td><span :class="['badge', s.status]">{{ s.status }}</span></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
