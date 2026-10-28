<script setup>
import { ref, computed } from 'vue';
import { useCrud } from '../composables/useCrud';
import PageHeader from './PageHeader.vue';
import SlideOver from './SlideOver.vue';
import StatusBadge from './StatusBadge.vue';
import Avatar from './Avatar.vue';
import AppIcon from './AppIcon.vue';

/**
 * Generic list + form page driven by a `fields` config:
 * [{ key, label, type?: 'text'|'date'|'number'|'email'|'textarea'|..., required?, default?,
 *    options?: [{value,label}], section?, badge?, list?: false, form?: false }]
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

const { items, loading, error, save, remove } = useCrud(props.api);
const form = ref(null); // null = panel closed
const search = ref('');

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

// Client-side search over every value of the row (fine for school-sized lists)
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return items.value;
  return items.value.filter((row) => Object.values(row).some((v) => v != null && String(v).toLowerCase().includes(q)));
});

const openNew = () => (form.value = empty());
// Spread copy so editing doesn't mutate the row until saved
const openEdit = (row) => (form.value = { ...row, ...dateFix(row) });
const dateFix = (row) =>
  Object.fromEntries(props.fields.filter((f) => f.type === 'date' && row[f.key]).map((f) => [f.key, row[f.key].slice(0, 10)]));

async function submit() {
  await save(form.value).catch(() => {});
  if (!error.value) form.value = null;
}

function confirmRemove(row) {
  if (confirm(`Delete this ${props.singular}?`)) remove(row.id).catch(() => {});
}

const label = (f, row) => f.options?.find((o) => o.value == row[f.key])?.label ?? row[f.key];
</script>

<template>
  <section>
    <PageHeader :title="title" :subtitle="subtitle">
      <button class="btn primary" @click="openNew"><AppIcon name="plus" />New {{ singular }}</button>
    </PageHeader>

    <div v-if="error && !form" class="alert"><AppIcon name="alert" />{{ error }}</div>

    <div class="card">
      <div class="toolbar">
        <label class="search">
          <AppIcon name="search" size="16" />
          <input v-model="search" type="search" :placeholder="`Search ${title.toLowerCase()}…`" />
        </label>
        <span class="muted small">{{ filtered.length }} of {{ items.length }}</span>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th v-if="identity">Name</th>
              <th v-for="f in listFields" :key="f.key">{{ f.label }}</th>
              <th class="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filtered" :key="row.id">
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
        <div v-else-if="!filtered.length" class="empty">
          <AppIcon name="inbox" size="32" />
          <p>{{ search ? 'No match for your search.' : `No ${title.toLowerCase()} yet.` }}</p>
          <button v-if="!search" class="btn secondary" @click="openNew"><AppIcon name="plus" />Add the first one</button>
        </div>
      </div>
    </div>

    <SlideOver v-if="form" :title="form.id ? `Edit ${singular}` : `New ${singular}`" @close="form = null">
      <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>
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
        <button type="submit" form="crud-form" class="btn primary" :disabled="loading">{{ loading ? 'Saving…' : 'Save' }}</button>
      </template>
    </SlideOver>
  </section>
</template>
