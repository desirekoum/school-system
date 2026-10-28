<script setup>
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';
import { PAGE_SIZES } from '../composables/usePaginatedList';

const props = defineProps({ total: Number, totalPages: Number });
// defineModel: two-way binding, used as v-model:page and v-model:page-size by the parent
const page = defineModel('page', { type: Number, required: true });
const pageSize = defineModel('pageSize', { type: Number, required: true });

const from = computed(() => (props.total ? (page.value - 1) * pageSize.value + 1 : 0));
const to = computed(() => Math.min(page.value * pageSize.value, props.total));

// Compact page list: 1 … 4 5 6 … 21
const pages = computed(() => {
  const last = props.totalPages;
  const cur = page.value;
  const set = new Set([1, last, cur - 1, cur, cur + 1].filter((p) => p >= 1 && p <= last));
  const sorted = [...set].sort((a, b) => a - b);
  const out = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push('…' + p);
    out.push(p);
  });
  return out;
});
</script>

<template>
  <div class="pagination">
    <p class="muted small">
      Showing <b>{{ from.toLocaleString() }}–{{ to.toLocaleString() }}</b> of <b>{{ total.toLocaleString() }}</b>
    </p>
    <div class="pagination-controls">
      <label class="page-size muted small">
        Rows per page
        <select v-model.number="pageSize">
          <option v-for="n in PAGE_SIZES" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>
      <nav class="pages" aria-label="Pagination">
        <button class="icon-btn" :disabled="page <= 1" aria-label="Previous page" @click="page--"><AppIcon name="chevronLeft" size="16" /></button>
        <template v-for="p in pages" :key="p">
          <span v-if="typeof p === 'string'" class="gap">…</span>
          <button v-else :class="['page-btn', { active: p === page }]" :aria-current="p === page ? 'page' : null" @click="page = p">{{ p }}</button>
        </template>
        <button class="icon-btn" :disabled="page >= totalPages" aria-label="Next page" @click="page++"><AppIcon name="chevronRight" size="16" /></button>
      </nav>
    </div>
  </div>
</template>
