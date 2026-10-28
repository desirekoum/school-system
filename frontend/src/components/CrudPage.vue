<script setup>
import { ref, computed } from 'vue';
import { useCrud } from '../composables/useCrud';

/**
 * Generic list + form page driven by a `fields` config:
 * [{ key, label, type?: 'text'|'date'|'number'|'email'|'textarea'|..., required?, default?,
 *    options?: [{value,label}], section?, list?: false, form?: false }]
 */
const props = defineProps({
  title: String,
  api: Object,
  fields: Array,
});

const { items, loading, error, save, remove } = useCrud(props.api);
const form = ref(null); // null = form hidden

const empty = () => Object.fromEntries(props.fields.map((f) => [f.key, f.default ?? '']));

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
  await save(form.value).catch(() => {});
  if (!error.value) form.value = null;
}

function confirmRemove(row) {
  if (confirm('Delete this record?')) remove(row.id).catch(() => {});
}

const display = (f, row) => f.options?.find((o) => o.value == row[f.key])?.label ?? row[f.display ?? f.key];
</script>

<template>
  <section>
    <header class="row">
      <h1>{{ title }}</h1>
      <button @click="openNew">+ New</button>
    </header>

    <p v-if="error" class="error">{{ error }}</p>

    <form v-if="form" class="card form-wrap" @submit.prevent="submit">
      <fieldset v-for="s in sections" :key="s.name" class="form">
        <legend v-if="s.name">{{ s.name }}</legend>
        <label v-for="f in s.fields" :key="f.key" :class="{ wide: f.type === 'textarea' }">
          <span>{{ f.label }}<template v-if="f.required"> *</template></span>
          <select v-if="f.options" v-model="form[f.key]" :required="f.required">
            <option v-if="!f.required" value="">—</option>
            <option v-for="o in f.options" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <textarea v-else-if="f.type === 'textarea'" v-model="form[f.key]" rows="2" :required="f.required" />
          <input v-else v-model="form[f.key]" :type="f.type ?? 'text'" :step="f.step" :required="f.required" />
        </label>
      </fieldset>
      <div class="row">
        <button type="submit" :disabled="loading">Save</button>
        <button type="button" class="secondary" @click="form = null">Cancel</button>
      </div>
    </form>

    <table class="card">
      <thead>
        <tr>
          <th v-for="f in fields.filter((f) => f.list !== false)" :key="f.key">{{ f.label }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in items" :key="row.id">
          <td v-for="f in fields.filter((f) => f.list !== false)" :key="f.key">{{ display(f, row) }}</td>
          <td class="actions">
            <slot name="actions" :row="row" />
            <button class="secondary" @click="openEdit(row)">Edit</button>
            <button class="danger" @click="confirmRemove(row)">Delete</button>
          </td>
        </tr>
        <tr v-if="!items.length && !loading"><td :colspan="fields.length + 1">No records yet.</td></tr>
      </tbody>
    </table>
  </section>
</template>
