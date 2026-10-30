<script setup>
import { computed } from 'vue';
import CrudPage from '../components/CrudPage.vue';
import { useAuth } from '../composables/useAuth';
import { teachersApi } from '../api/http';
import { GENDERS, TEACHER_STATUSES, CONTRACT_TYPES } from '../config/options';
import { t } from '../i18n';

const f = (key) => t(`fields.${key}`);
const fields = computed(() => [
  { section: f('identity'), key: 'employee_number', label: f('employeeNo') },
  { section: f('identity'), key: 'last_name', label: f('lastName'), required: true, list: false },
  { section: f('identity'), key: 'first_name', label: f('firstName'), required: true, list: false },
  { section: f('identity'), key: 'gender', label: f('gender'), options: GENDERS, list: false },
  { section: f('identity'), key: 'birth_date', label: f('birthDate'), type: 'date', list: false },
  { section: f('identity'), key: 'photo_url', label: f('photoUrl'), type: 'url', list: false },

  { section: f('contact'), key: 'email', label: f('email'), type: 'email', required: true, list: false },
  { section: f('contact'), key: 'phone', label: f('phone') },
  { section: f('contact'), key: 'address', label: f('address'), list: false },

  { section: f('job'), key: 'specialty', label: f('specialty') },
  { section: f('job'), key: 'status', label: f('status'), options: TEACHER_STATUSES, required: true, default: 'active', badge: true, filter: true },
  { section: f('job'), key: 'contract_type', label: f('contract'), options: CONTRACT_TYPES, filter: true },
  { section: f('job'), key: 'hire_date', label: f('hireDate'), type: 'date', list: false },
  { section: f('job'), key: 'qualifications', label: f('qualifications'), type: 'textarea', list: false },

  { section: f('pay'), key: 'salary', label: f('salary'), type: 'number', step: '0.01', list: false },
  { section: f('pay'), key: 'hourly_rate', label: f('hourlyRate'), type: 'number', step: '0.01', list: false },
  { section: f('pay'), key: 'bank_account', label: f('bankAccount'), list: false },
]);

const identity = (r) => ({ name: `${r.first_name} ${r.last_name}`, sub: r.email, photo: r.photo_url });

const { can } = useAuth();
</script>

<template>
  <CrudPage :title="t('pages.teachers.title')" :singular="t('pages.teachers.singular')" :subtitle="t('pages.teachers.subtitle')"
            :api="teachersApi" :readonly="!can('staff:write')" :fields="fields"
            :imports="[{ entity: 'teachers', label: t('pages.teachers.title') }]" export-name="teachers" :identity="identity" />
</template>
