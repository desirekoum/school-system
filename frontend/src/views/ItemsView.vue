<script setup>
import { computed } from 'vue';
import CrudPage from '../components/CrudPage.vue';
import { useAuth } from '../composables/useAuth';
import { itemsApi } from '../api/http';
import { money, ITEM_CATEGORIES } from '../config/finance';
import { t } from '../i18n';

// Stock left empty = not tracked (services and fees such as insurance or exam fees)
const fields = computed(() => [
  { key: 'code', label: t('pages.courses.code'), required: true },
  { key: 'name', label: t('common.name'), required: true, wrap: true },
  { key: 'category', label: t('common.category'), options: ITEM_CATEGORIES, filter: true, default: 'uniform' },
  { key: 'price', label: t('pages.items.price'), type: 'number', required: true, format: money },
  { key: 'stock', label: t('pages.items.stock'), type: 'number', placeholder: t('pages.items.stockHint'),
    format: (v) => (v == null ? t('pages.items.notTracked') : v === 0 ? t('pages.items.outOfStock') : v) },
  { key: 'sold', label: t('pages.items.sold'), form: false },
  {
    key: 'is_active', label: t('common.status'), badge: true, filter: true, default: true,
    options: [{ value: true, label: t('pages.items.onSale') }, { value: false, label: t('pages.items.withdrawn') }],
  },
  { key: 'description', label: t('common.description'), type: 'textarea', list: false },
]);

const { can } = useAuth();
</script>

<template>
  <CrudPage :title="t('pages.items.title')" :singular="t('pages.items.singular')" :subtitle="t('pages.items.subtitle')"
            :api="itemsApi" :readonly="!can('items:write')" :fields="fields"
            :imports="[{ entity: 'items', label: t('pages.items.title') }]" export-name="items" />
</template>
