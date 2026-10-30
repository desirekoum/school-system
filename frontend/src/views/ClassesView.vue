<script setup>
import { ref, computed, onMounted } from 'vue';
import CrudPage from '../components/CrudPage.vue';
import { useAuth } from '../composables/useAuth';
import AppIcon from '../components/AppIcon.vue';
import { classesApi, teachersApi, academicYearsApi } from '../api/http';
import { money } from '../config/finance';
import { t } from '../i18n';

const { can } = useAuth();

const teachers = ref([]);
const years = ref([]);
onMounted(async () => {
  // The teacher list is staff data: roles without staff:read just don't get the homeroom dropdown
  [teachers.value, years.value] = await Promise.all([can('staff:read') ? teachersApi.list() : [], academicYearsApi.list()]);
});

// computed: re-evaluates when `teachers` changes, so the select options stay in sync
const fields = computed(() => [
  { key: 'name', label: t('common.name'), required: true },
  { key: 'level', label: t('pages.classes.level'), required: true },
  {
    key: 'academic_year',
    label: t('common.year'),
    required: true,
    filter: true,
    default: years.value.find((y) => y.is_current)?.name,
    options: years.value.map((y) => ({ value: y.name, label: y.name })),
  },
  { key: 'capacity', label: t('pages.classes.capacity'), type: 'number', required: true, default: 40 },
  { key: 'tuition_fee', label: t('pages.classes.tuition'), type: 'number', required: true, default: 0, format: money },
  {
    key: 'homeroom_teacher_id',
    label: t('pages.classes.homeroom'),
    options: teachers.value.map((x) => ({ value: x.id, label: `${x.first_name} ${x.last_name}` })),
  },
  { key: 'enrolled', label: t('pages.classes.enrolled'), form: false },
]);

</script>

<template>
  <CrudPage :title="t('pages.classes.title')" :singular="t('pages.classes.singular')" :subtitle="t('pages.classes.subtitle')"
            :api="classesApi" :readonly="!can('academics:write')" :fields="fields"
            :imports="[{ entity: 'classes', label: t('pages.classes.title') }, { entity: 'class-courses', label: t('pages.classes.importClassCourses') }]" export-name="classes">
    <template #actions="{ row }">
      <RouterLink :to="`/classes/${row.id}`" class="icon-btn" :title="t('common.open')"><AppIcon name="chevronRight" size="16" /></RouterLink>
    </template>
  </CrudPage>
</template>
