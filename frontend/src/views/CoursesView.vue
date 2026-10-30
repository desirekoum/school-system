<script setup>
import { computed } from 'vue';
import CrudPage from '../components/CrudPage.vue';
import { useAuth } from '../composables/useAuth';
import { coursesApi } from '../api/http';
import { t } from '../i18n';

// computed: labels are re-read when the language changes
const fields = computed(() => [
  { key: 'code', label: t('pages.courses.code'), required: true },
  { key: 'name', label: t('common.name'), required: true },
  // Defaults mirror the DB defaults: an empty input would be sent as NULL and rejected
  { key: 'coefficient', label: t('pages.courses.coefficient'), type: 'number', step: '0.5', required: true, default: 1 },
  { key: 'hours_per_week', label: t('pages.courses.hours'), type: 'number', required: true, default: 1 },
  { key: 'description', label: t('common.description'), type: 'textarea', list: false },
]);

const { can } = useAuth();
</script>

<template>
  <CrudPage :title="t('pages.courses.title')" :singular="t('pages.courses.singular')" :subtitle="t('pages.courses.subtitle')"
            :api="coursesApi" :readonly="!can('academics:write')" :fields="fields"
            :imports="[{ entity: 'courses', label: t('pages.courses.title') }]" export-name="courses" />
</template>
