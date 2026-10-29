<script setup>
import CrudPage from '../components/CrudPage.vue';
import { useAuth } from '../composables/useAuth';
import { teachersApi } from '../api/http';
import { GENDERS, TEACHER_STATUSES, CONTRACT_TYPES } from '../config/options';

const fields = [
  { section: 'Identity', key: 'employee_number', label: 'Employee no.' },
  { section: 'Identity', key: 'last_name', label: 'Last name', required: true, list: false },
  { section: 'Identity', key: 'first_name', label: 'First name', required: true, list: false },
  { section: 'Identity', key: 'gender', label: 'Gender', options: GENDERS, list: false },
  { section: 'Identity', key: 'birth_date', label: 'Birth date', type: 'date', list: false },
  { section: 'Identity', key: 'photo_url', label: 'Photo URL', type: 'url', list: false },

  { section: 'Contact', key: 'email', label: 'Email', type: 'email', required: true, list: false },
  { section: 'Contact', key: 'phone', label: 'Phone' },
  { section: 'Contact', key: 'address', label: 'Address', list: false },

  { section: 'Job', key: 'specialty', label: 'Specialty' },
  { section: 'Job', key: 'status', label: 'Status', options: TEACHER_STATUSES, required: true, default: 'active', badge: true, filter: true },
  { section: 'Job', key: 'contract_type', label: 'Contract', options: CONTRACT_TYPES, filter: true },
  { section: 'Job', key: 'hire_date', label: 'Hire date', type: 'date', list: false },
  { section: 'Job', key: 'qualifications', label: 'Qualifications / diplomas', type: 'textarea', list: false },

  { section: 'Pay', key: 'salary', label: 'Monthly salary', type: 'number', step: '0.01', list: false },
  { section: 'Pay', key: 'hourly_rate', label: 'Hourly rate', type: 'number', step: '0.01', list: false },
  { section: 'Pay', key: 'bank_account', label: 'Bank account', list: false },
];

const identity = (t) => ({ name: `${t.first_name} ${t.last_name}`, sub: t.email, photo: t.photo_url });

const { can } = useAuth();
</script>

<template>
  <CrudPage title="Teachers" singular="teacher" subtitle="Teaching staff, contracts and pay details."
            :api="teachersApi" :readonly="!can('staff:write')" :fields="fields" :identity="identity" />
</template>
