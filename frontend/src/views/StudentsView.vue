<script setup>
import CrudPage from '../components/CrudPage.vue';
import { studentsApi } from '../api/http';
import { GENDERS, BLOOD_GROUPS, STUDENT_STATUSES } from '../config/options';

const fields = [
  { section: 'Identity', key: 'matricule', label: 'Matricule', required: true },
  { section: 'Identity', key: 'last_name', label: 'Last name', required: true },
  { section: 'Identity', key: 'first_name', label: 'First name', required: true },
  { section: 'Identity', key: 'gender', label: 'Gender', options: GENDERS },
  { section: 'Identity', key: 'birth_date', label: 'Birth date', type: 'date', list: false },
  { section: 'Identity', key: 'birth_place', label: 'Birth place', list: false },
  { section: 'Identity', key: 'nationality', label: 'Nationality', list: false },
  { section: 'Identity', key: 'photo_url', label: 'Photo URL', type: 'url', list: false },

  { section: 'Contact', key: 'phone', label: 'Phone' },
  { section: 'Contact', key: 'email', label: 'Email', type: 'email', list: false },
  { section: 'Contact', key: 'address', label: 'Address', list: false },
  { section: 'Contact', key: 'emergency_contact_name', label: 'Emergency contact', list: false },
  { section: 'Contact', key: 'emergency_contact_phone', label: 'Emergency phone', list: false },

  { section: 'Schooling', key: 'status', label: 'Status', options: STUDENT_STATUSES, required: true, default: 'active' },
  // Form sends every key, so the DB default (CURRENT_DATE) wouldn't apply: prefill today instead
  { section: 'Schooling', key: 'admission_date', label: 'Admission date', type: 'date', list: false, default: new Date().toISOString().slice(0, 10) },
  { section: 'Schooling', key: 'previous_school', label: 'Previous school', list: false },

  { section: 'Health', key: 'blood_group', label: 'Blood group', options: BLOOD_GROUPS, list: false },
  { section: 'Health', key: 'allergies', label: 'Allergies', type: 'textarea', list: false },
  { section: 'Health', key: 'medical_notes', label: 'Medical notes', type: 'textarea', list: false },

  // Guardians are managed on the student page (separate table)
  { key: 'primary_guardian', label: 'Guardian', form: false },
];
</script>

<template>
  <CrudPage title="Students" :api="studentsApi" :fields="fields">
    <template #actions="{ row }">
      <RouterLink :to="`/students/${row.id}`" class="btn secondary">Open</RouterLink>
    </template>
  </CrudPage>
</template>
