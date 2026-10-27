<script setup>
import { ref, computed, onMounted } from 'vue';
import CrudPage from '../components/CrudPage.vue';
import { classesApi, teachersApi } from '../api/http';

const teachers = ref([]);
onMounted(async () => (teachers.value = await teachersApi.list()));

// computed: re-evaluates when `teachers` changes, so the select options stay in sync
const fields = computed(() => [
  { key: 'name', label: 'Name', required: true },
  { key: 'level', label: 'Level', required: true },
  { key: 'academic_year', label: 'Year', required: true },
  { key: 'capacity', label: 'Capacity', type: 'number' },
  {
    key: 'homeroom_teacher_id',
    label: 'Homeroom teacher',
    options: teachers.value.map((t) => ({ value: t.id, label: `${t.first_name} ${t.last_name}` })),
  },
  { key: 'enrolled', label: 'Enrolled', form: false },
]);
</script>

<template>
  <CrudPage title="Classes" :api="classesApi" :fields="fields">
    <template #actions="{ row }">
      <RouterLink :to="`/classes/${row.id}`" class="btn secondary">Open</RouterLink>
    </template>
  </CrudPage>
</template>
