<script setup>
import CrudPage from '../components/CrudPage.vue';
import { useAuth } from '../composables/useAuth';
import { itemsApi } from '../api/http';
import { money, ITEM_CATEGORIES } from '../config/finance';

// Stock left empty = not tracked (services and fees such as insurance or exam fees)
const fields = [
  { key: 'code', label: 'Code', required: true },
  { key: 'name', label: 'Name', required: true, wrap: true },
  { key: 'category', label: 'Category', options: ITEM_CATEGORIES, filter: true, default: 'uniform' },
  { key: 'price', label: 'Price (FCFA)', type: 'number', required: true, format: money },
  { key: 'stock', label: 'Stock', type: 'number', placeholder: 'Empty = not tracked (services, fees)', format: (v) => (v == null ? 'Not tracked' : v === 0 ? 'Out of stock' : v) },
  { key: 'sold', label: 'Sold', form: false },
  {
    key: 'is_active', label: 'Status', badge: true, filter: true, default: true,
    options: [{ value: true, label: 'On sale' }, { value: false, label: 'Withdrawn' }],
  },
  { key: 'description', label: 'Description', type: 'textarea', list: false },
];

const { can } = useAuth();
</script>

<template>
  <CrudPage title="Items for sale" singular="item" subtitle="Uniforms, books, supplies and services the school sells to students. Stock goes up with purchases and down with sales."
            :api="itemsApi" :readonly="!can('items:write')" :fields="fields" />
</template>
