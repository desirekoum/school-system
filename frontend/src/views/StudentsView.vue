<script setup>
import CrudPage from '../components/CrudPage.vue';
import { studentsApi } from '../api/http';

const fields = [
  { key: 'matricule', label: 'Matricule', required: true },
  { key: 'last_name', label: 'Last name', required: true },
  { key: 'first_name', label: 'First name', required: true },
  { key: 'birth_date', label: 'Birth date', type: 'date', list: false },
  { key: 'gender', label: 'Gender', options: [{ value: 'M', label: 'M' }, { value: 'F', label: 'F' }] },
  { key: 'email', label: 'Email', type: 'email', list: false },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Address', list: false },
  { key: 'guardian_name', label: 'Guardian' },
  { key: 'guardian_phone', label: 'Guardian phone', list: false },
];
</script>

<template>
  <CrudPage title="Students" :api="studentsApi" :fields="fields" />
</template>
