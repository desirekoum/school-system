<script setup>
import CrudPage from '../components/CrudPage.vue';
import { coursesApi } from '../api/http';

const fields = [
  { key: 'code', label: 'Code', required: true },
  { key: 'name', label: 'Name', required: true },
  { key: 'coefficient', label: 'Coefficient', type: 'number' },
  { key: 'hours_per_week', label: 'Hours/week', type: 'number' },
  { key: 'description', label: 'Description', list: false },
];
</script>

<template>
  <CrudPage title="Courses" :api="coursesApi" :fields="fields" />
</template>
