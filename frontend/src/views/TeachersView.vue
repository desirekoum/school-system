<script setup>
import CrudPage from '../components/CrudPage.vue';
import { teachersApi } from '../api/http';

const fields = [
  { key: 'last_name', label: 'Last name', required: true },
  { key: 'first_name', label: 'First name', required: true },
  { key: 'email', label: 'Email', type: 'email', required: true },
  { key: 'phone', label: 'Phone' },
  { key: 'specialty', label: 'Specialty' },
  { key: 'hire_date', label: 'Hire date', type: 'date', list: false },
];
</script>

<template>
  <CrudPage title="Teachers" :api="teachersApi" :fields="fields" />
</template>
