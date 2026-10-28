<script setup>
import { ref, computed } from 'vue';
import { usePaginatedList } from '../composables/usePaginatedList';
import PaginationBar from './PaginationBar.vue';
import PageHeader from './PageHeader.vue';
import SlideOver from './SlideOver.vue';
import StatusBadge from './StatusBadge.vue';
import Avatar from './Avatar.vue';
import AppIcon from './AppIcon.vue';

/**
 * Generic list + form page driven by a `fields` config:
 * [{ key, label, type?: 'text'|'date'|'number'|'email'|'textarea'|..., required?, default?,
 *    options?: [{value,label}], section?, badge?, filter?, list?: false, form?: false }]
 * Fields with `filter: true` (and options) get a filter dropdown in the toolbar.
 * `identity(row)` → { name, sub?, photo? } renders a leading avatar + name column.
 * `rowLink(row)` → route location makes that name a link (e.g. to a detail page).
 */
const props = defineProps({
  title: String,
  subtitle: String,
  singular: { type: String, default: 'record' },
  api: Object,
  fields: Array,
  identity: Function,
  rowLink: Function,
});

const filterFields = computed(() => props.fields.filter((f) => f.filter && f.options));
// Server-side pagination: only the current page is loaded, search and filters run in SQL
const { items, total, totalPages, page, pageSize, search, filters, loading, error, load } = usePaginatedList(
  (params) => props.api.list(params),
  { filters: Object.fromEntries(props.fields.filter((f) => f.filter).map((f) => [f.key, ''])) },
);
const form = ref(null); // null = panel closed
const saving = ref(false);
const formError = ref('');

const empty = () => Object.fromEntries(props.fields.map((f) => [f.key, f.default ?? '']));
const listFields = computed(() => props.fields.filter((f) => f.list !== false));

// Group form fields by `section` (keeps first-seen order) so long forms stay readable
const sections = computed(() => {
  const groups = new Map();
  for (const f of props.fields.filter((f) => f.form !== false)) {
    const name = f.section ?? '';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(f);
  }
  return [...groups].map(([name, fields]) => ({ name, fields }));
});

const openNew = () => (form.value = empty());
// Spread copy so editing doesn't mutate the row until saved
const openEdit = (row) => (form.value = { ...row, ...dateFix(row) });
const dateFix = (row) =>
  Object.fromEntries(props.fields.filter((f) => f.type === 'date' && row[f.key]).map((f) => [f.key, row[f.key].slice(0, 10)]));

async function submit() {
  saving.value = true;
  formError.value = '';
  try {
    const data = form.value;
    await (data.id ? props.api.update(data.id, data) : props.api.create(data));
    form.value = null;
    await load();
  } catch (e) {
    formError.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function confirmRemove(row) {
  if (!confirm(`Delete this ${props.singular}?`)) return;
  try {
    await props.api.remove(row.id);
    await load();
  } catch (e) {
    error.value = e.message;
  }
}

const isFiltered = computed(() => !!search.value || Object.values(filters).some(Boolean));

const label = (f, row) => f.options?.find((o) => o.value == row[f.key])?.label ?? row[f.key];
</script>

<template>
  <section>
    <PageHeader :title="title" :subtitle="subtitle">
      <button class="btn primary" @click="openNew"><AppIcon name="plus" />New {{ singular }}</button>
    </PageHeader>

    <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>

    <div class="card">
      <div class="toolbar">
        <label class="search">
          <AppIcon name="search" size="16" />
          <input v-model="search" type="search" :placeholder="`Search ${title.toLowerCase()}…`" />
        </label>
        <div class="filters">
          <select v-for="f in filterFields" :key="f.key" v-model="filters[f.key]" :aria-label="`Filter by ${f.label}`">
            <option value="">Any {{ f.label.toLowerCase() }}</option>
            <option v-for="o in f.options" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>
      </div>

      <div class="table-wrap" :class="{ 'is-loading': loading && items.length }">
        <table class="table">
          <thead>
            <tr>
              <th v-if="identity">Name</th>
              <th v-for="f in listFields" :key="f.key">{{ f.label }}</th>
              <th class="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in items" :key="row.id">
              <td v-if="identity">
                <component :is="rowLink ? 'RouterLink' : 'div'" :to="rowLink?.(row)" class="identity">
                  <Avatar :name="identity(row).name" :src="identity(row).photo" />
                  <div>
                    <div class="strong">{{ identity(row).name }}</div>
                    <div v-if="identity(row).sub" class="muted small">{{ identity(row).sub }}</div>
                  </div>
                </component>
              </td>
              <td v-for="f in listFields" :key="f.key">
                <StatusBadge v-if="f.badge" :value="row[f.key]" :label="label(f, row)" />
                <template v-else>{{ label(f, row) ?? '—' }}</template>
              </td>
              <td class="right">
                <div class="row-actions">
                  <slot name="actions" :row="row" />
                  <button class="icon-btn" title="Edit" @click="openEdit(row)"><AppIcon name="edit" size="16" /></button>
                  <button class="icon-btn danger" title="Delete" @click="confirmRemove(row)"><AppIcon name="trash" size="16" /></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="loading && !items.length" class="empty">Loading…</div>
        <div v-else-if="!items.length" class="empty">
          <AppIcon name="inbox" size="32" />
          <p>{{ isFiltered ? 'No match for your search.' : `No ${title.toLowerCase()} yet.` }}</p>
          <button v-if="!isFiltered" class="btn secondary" @click="openNew"><AppIcon name="plus" />Add the first one</button>
        </div>
      </div>
      <PaginationBar v-if="total" v-model:page="page" v-model:page-size="pageSize" :total="total" :total-pages="totalPages" />
    </div>

    <SlideOver v-if="form" :title="form.id ? `Edit ${singular}` : `New ${singular}`" @close="form = null">
      <div v-if="formError" class="alert"><AppIcon name="alert" />{{ formError }}</div>
      <form id="crud-form" @submit.prevent="submit">
        <fieldset v-for="s in sections" :key="s.name" class="form-section">
          <legend v-if="s.name">{{ s.name }}</legend>
          <div class="form-grid">
            <label v-for="f in s.fields" :key="f.key" class="field" :class="{ wide: f.type === 'textarea' }">
              <span>{{ f.label }}<b v-if="f.required" class="req">*</b></span>
              <select v-if="f.options" v-model="form[f.key]" :required="f.required">
                <option v-if="!f.required" value="">—</option>
                <option v-for="o in f.options" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
              <textarea v-else-if="f.type === 'textarea'" v-model="form[f.key]" rows="3" :required="f.required" />
              <input v-else v-model="form[f.key]" :type="f.type ?? 'text'" :step="f.step" :required="f.required" />
            </label>
          </div>
        </fieldset>
      </form>
      <template #footer>
        <button type="button" class="btn secondary" @click="form = null">Cancel</button>
        <button type="submit" form="crud-form" class="btn primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</button>
      </template>
    </SlideOver>
  </section>
</template>
