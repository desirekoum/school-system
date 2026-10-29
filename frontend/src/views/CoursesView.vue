<script setup>
import CrudPage from '../components/CrudPage.vue';
import { useAuth } from '../composables/useAuth';
import { coursesApi } from '../api/http';

const fields = [
  { key: 'code', label: 'Code', required: true },
  { key: 'name', label: 'Name', required: true },
  // Defaults mirror the DB defaults: an empty input would be sent as NULL and rejected
  { key: 'coefficient', label: 'Coefficient', type: 'number', step: '0.5', required: true, default: 1 },
  { key: 'hours_per_week', label: 'Hours/week', type: 'number', required: true, default: 1 },
  { key: 'description', label: 'Description', type: 'textarea', list: false },
];

const { can } = useAuth();
</script>

<template>
  <CrudPage title="Courses" singular="course" subtitle="Subjects taught, with coefficients and weekly hours."
            :api="coursesApi" :readonly="!can('academics:write')" :fields="fields" />
</template>
