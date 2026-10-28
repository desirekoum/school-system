<script setup>
import CrudPage from '../components/CrudPage.vue';
import AppIcon from '../components/AppIcon.vue';
import { studentsApi } from '../api/http';
import { GENDERS, BLOOD_GROUPS, STUDENT_STATUSES } from '../config/options';

const fields = [
  { section: 'Identity', key: 'matricule', label: 'Matricule', required: true },
  { section: 'Identity', key: 'last_name', label: 'Last name', required: true, list: false },
  { section: 'Identity', key: 'first_name', label: 'First name', required: true, list: false },
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

  { section: 'Schooling', key: 'status', label: 'Status', options: STUDENT_STATUSES, required: true, default: 'active', badge: true },
  // Form sends every key, so the DB default (CURRENT_DATE) wouldn't apply: prefill today instead
  { section: 'Schooling', key: 'admission_date', label: 'Admission date', type: 'date', list: false, default: new Date().toISOString().slice(0, 10) },
  { section: 'Schooling', key: 'previous_school', label: 'Previous school', list: false },

  { section: 'Health', key: 'blood_group', label: 'Blood group', options: BLOOD_GROUPS, list: false },
  { section: 'Health', key: 'allergies', label: 'Allergies', type: 'textarea', list: false },
  { section: 'Health', key: 'medical_notes', label: 'Medical notes', type: 'textarea', list: false },

  // Guardians are managed on the student page (separate table)
  { key: 'primary_guardian', label: 'Guardian', form: false },
];

const identity = (s) => ({ name: `${s.first_name} ${s.last_name}`, sub: s.email, photo: s.photo_url });
</script>

<template>
  <CrudPage title="Students" singular="student" subtitle="Student records, contacts and health information."
            :api="studentsApi" :fields="fields" :identity="identity" :row-link="(s) => `/students/${s.id}`">
    <template #actions="{ row }">
      <RouterLink :to="`/students/${row.id}`" class="icon-btn" title="Open"><AppIcon name="chevronRight" size="16" /></RouterLink>
    </template>
  </CrudPage>
</template>
