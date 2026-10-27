<script setup>
import { ref, onMounted } from 'vue';
import { registrationsApi, studentsApi, classesApi } from '../api/http';

const registrations = ref([]);
const students = ref([]);
const classes = ref([]);
const form = ref({ student_id: '', class_id: '' });
const error = ref('');

const load = async () => (registrations.value = await registrationsApi.list());

onMounted(async () => {
  [students.value, classes.value] = await Promise.all([studentsApi.list(), classesApi.list()]);
  await load();
});

async function wrap(fn) {
  error.value = '';
  try {
    await fn();
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

const register = () => wrap(async () => {
  await registrationsApi.create(form.value);
  form.value = { student_id: '', class_id: '' };
});
const setStatus = (r, status) => wrap(() => registrationsApi.setStatus(r.id, status));
const remove = (r) => confirm('Delete registration?') && wrap(() => registrationsApi.remove(r.id));
</script>

<template>
  <section>
    <h1>Registrations</h1>
    <p v-if="error" class="error">{{ error }}</p>

    <form class="row card form" @submit.prevent="register">
      <select v-model="form.student_id" required>
        <option value="">Student…</option>
        <option v-for="s in students" :key="s.id" :value="s.id">{{ s.matricule }} – {{ s.last_name }} {{ s.first_name }}</option>
      </select>
      <select v-model="form.class_id" required>
        <option value="">Class…</option>
        <option v-for="c in classes" :key="c.id" :value="c.id">
          {{ c.name }} ({{ c.academic_year }}) – {{ c.enrolled }}/{{ c.capacity }}
        </option>
      </select>
      <button type="submit">Register</button>
    </form>

    <table class="card">
      <thead><tr><th>Date</th><th>Matricule</th><th>Student</th><th>Class</th><th>Year</th><th>Status</th><th></th></tr></thead>
      <tbody>
        <tr v-for="r in registrations" :key="r.id">
          <td>{{ new Date(r.registered_at).toLocaleDateString() }}</td>
          <td>{{ r.matricule }}</td><td>{{ r.student }}</td><td>{{ r.class_name }}</td><td>{{ r.academic_year }}</td>
          <td><span :class="['badge', r.status]">{{ r.status }}</span></td>
          <td class="actions">
            <button v-if="r.status !== 'confirmed'" @click="setStatus(r, 'confirmed')">Confirm</button>
            <button v-if="r.status !== 'cancelled'" class="secondary" @click="setStatus(r, 'cancelled')">Cancel</button>
            <button class="danger" @click="remove(r)">Delete</button>
          </td>
        </tr>
        <tr v-if="!registrations.length"><td colspan="7">No registrations yet.</td></tr>
      </tbody>
    </table>
  </section>
</template>
