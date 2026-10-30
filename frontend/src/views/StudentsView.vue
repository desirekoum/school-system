<script setup>
import { computed } from 'vue';
import CrudPage from '../components/CrudPage.vue';
import { useAuth } from '../composables/useAuth';
import AppIcon from '../components/AppIcon.vue';
import { studentsApi } from '../api/http';
import { GENDERS, BLOOD_GROUPS, STUDENT_STATUSES } from '../config/options';
import { t } from '../i18n';

const f = (key) => t(`fields.${key}`);
const fields = computed(() => [
  { section: f('identity'), key: 'matricule', label: f('matricule'), required: true },
  { section: f('identity'), key: 'last_name', label: f('lastName'), required: true, list: false },
  { section: f('identity'), key: 'first_name', label: f('firstName'), required: true, list: false },
  { section: f('identity'), key: 'gender', label: f('gender'), options: GENDERS },
  { section: f('identity'), key: 'birth_date', label: f('birthDate'), type: 'date', list: false },
  { section: f('identity'), key: 'birth_place', label: f('birthPlace'), list: false },
  { section: f('identity'), key: 'nationality', label: f('nationality'), list: false },
  { section: f('identity'), key: 'photo_url', label: f('photoUrl'), type: 'url', list: false },

  { section: f('contact'), key: 'phone', label: f('phone') },
  { section: f('contact'), key: 'email', label: f('email'), type: 'email', list: false },
  { section: f('contact'), key: 'address', label: f('address'), list: false },
  { section: f('contact'), key: 'emergency_contact_name', label: f('emergencyContact'), list: false },
  { section: f('contact'), key: 'emergency_contact_phone', label: f('emergencyPhone'), list: false },

  { section: f('schooling'), key: 'status', label: f('status'), options: STUDENT_STATUSES, required: true, default: 'active', badge: true, filter: true },
  // Form sends every key, so the DB default (CURRENT_DATE) wouldn't apply: prefill today instead
  { section: f('schooling'), key: 'admission_date', label: f('admissionDate'), type: 'date', list: false, default: new Date().toISOString().slice(0, 10) },
  { section: f('schooling'), key: 'previous_school', label: f('previousSchool'), list: false },

  { section: f('health'), key: 'blood_group', label: f('bloodGroup'), options: BLOOD_GROUPS, list: false },
  { section: f('health'), key: 'allergies', label: f('allergies'), type: 'textarea', list: false },
  { section: f('health'), key: 'medical_notes', label: f('medicalNotes'), type: 'textarea', list: false },

  // Guardians are managed on the student page (separate table)
  { key: 'primary_guardian', label: f('guardian'), form: false },
]);

const identity = (s) => ({ name: `${s.first_name} ${s.last_name}`, sub: s.email, photo: s.photo_url });

const { can } = useAuth();
</script>

<template>
  <CrudPage :title="t('pages.students.title')" :singular="t('pages.students.singular')" :subtitle="t('pages.students.subtitle')"
            :api="studentsApi" :readonly="!can('students:write')" :fields="fields"
            :imports="[{ entity: 'students', label: t('pages.students.title') }, { entity: 'guardians', label: t('pages.students.importGuardians') }]"
            export-name="students" :identity="identity" :row-link="(s) => `/students/${s.id}`">
    <template #actions="{ row }">
      <RouterLink :to="`/students/${row.id}`" class="icon-btn" :title="t('common.open')"><AppIcon name="chevronRight" size="16" /></RouterLink>
    </template>
  </CrudPage>
</template>
