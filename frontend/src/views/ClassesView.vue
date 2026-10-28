<script setup>
import { ref, computed, onMounted } from 'vue';
import CrudPage from '../components/CrudPage.vue';
import AppIcon from '../components/AppIcon.vue';
import { classesApi, teachersApi, academicYearsApi } from '../api/http';

const teachers = ref([]);
const years = ref([]);
onMounted(async () => {
  [teachers.value, years.value] = await Promise.all([teachersApi.list(), academicYearsApi.list()]);
});

// computed: re-evaluates when `teachers` changes, so the select options stay in sync
const fields = computed(() => [
  { key: 'name', label: 'Name', required: true },
  { key: 'level', label: 'Level', required: true },
  {
    key: 'academic_year',
    label: 'Year',
    required: true,
    filter: true,
    default: years.value.find((y) => y.is_current)?.name,
    options: years.value.map((y) => ({ value: y.name, label: y.name })),
  },
  { key: 'capacity', label: 'Capacity', type: 'number', required: true, default: 40 },
  {
    key: 'homeroom_teacher_id',
    label: 'Homeroom teacher',
    options: teachers.value.map((t) => ({ value: t.id, label: `${t.first_name} ${t.last_name}` })),
  },
  { key: 'enrolled', label: 'Enrolled', form: false },
]);
</script>

<template>
  <CrudPage title="Classes" singular="class" subtitle="Classes per academic year, homeroom teachers and enrollment."
            :api="classesApi" :fields="fields">
    <template #actions="{ row }">
      <RouterLink :to="`/classes/${row.id}`" class="icon-btn" title="Open"><AppIcon name="chevronRight" size="16" /></RouterLink>
    </template>
  </CrudPage>
</template>
