<script setup>
import CrudPage from '../components/CrudPage.vue';
import { teachersApi } from '../api/http';
import { GENDERS, TEACHER_STATUSES, CONTRACT_TYPES } from '../config/options';

const fields = [
  { section: 'Identity', key: 'employee_number', label: 'Employee no.' },
  { section: 'Identity', key: 'last_name', label: 'Last name', required: true },
  { section: 'Identity', key: 'first_name', label: 'First name', required: true },
  { section: 'Identity', key: 'gender', label: 'Gender', options: GENDERS, list: false },
  { section: 'Identity', key: 'birth_date', label: 'Birth date', type: 'date', list: false },
  { section: 'Identity', key: 'photo_url', label: 'Photo URL', type: 'url', list: false },

  { section: 'Contact', key: 'email', label: 'Email', type: 'email', required: true },
  { section: 'Contact', key: 'phone', label: 'Phone' },
  { section: 'Contact', key: 'address', label: 'Address', list: false },

  { section: 'Job', key: 'specialty', label: 'Specialty' },
  { section: 'Job', key: 'status', label: 'Status', options: TEACHER_STATUSES, required: true, default: 'active' },
  { section: 'Job', key: 'contract_type', label: 'Contract', options: CONTRACT_TYPES },
  { section: 'Job', key: 'hire_date', label: 'Hire date', type: 'date', list: false },
  { section: 'Job', key: 'qualifications', label: 'Qualifications / diplomas', type: 'textarea', list: false },

  { section: 'Pay', key: 'salary', label: 'Monthly salary', type: 'number', step: '0.01', list: false },
  { section: 'Pay', key: 'hourly_rate', label: 'Hourly rate', type: 'number', step: '0.01', list: false },
  { section: 'Pay', key: 'bank_account', label: 'Bank account', list: false },
];
</script>

<template>
  <CrudPage title="Teachers" :api="teachersApi" :fields="fields" />
</template>
