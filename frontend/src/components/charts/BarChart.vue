<script setup>
import { ref, computed } from 'vue';

// Vertical bars in plain HTML/CSS (height = value / max). `tone(item)` can color a bar (e.g. low averages in red).
const props = defineProps({
  items: { type: Array, required: true },      // [{ label, value, to? }]
  height: { type: Number, default: 160 },
  format: { type: Function, default: (v) => v },
  max: { type: Number, default: null },
  tone: { type: Function, default: () => '' },
  target: { type: Number, default: null },
});
const hover = ref(null);
const top = computed(() => props.max ?? Math.max(1, ...props.items.map((i) => i.value)));
</script>

<template>
  <div class="chart bar-chart2">
    <div class="bars" :style="{ height: `${height}px` }">
      <i v-if="target != null" class="bars-target" :style="{ bottom: `${(target / top) * 100}%` }" />
      <component :is="it.to ? 'RouterLink' : 'div'" v-for="(it, i) in items" :key="it.label" :to="it.to" class="bar-col"
                 @mouseenter="hover = i" @mouseleave="hover = null" @focus="hover = i" @blur="hover = null">
        <span class="bar" :class="tone(it)" :style="{ height: `${Math.max(1, (it.value / top) * 100)}%` }" />
        <div v-if="hover === i" class="chart-tip"><b>{{ format(it.value) }}</b><span>{{ it.label }}</span></div>
      </component>
    </div>
    <div class="bars-x">
      <span v-for="it in items" :key="it.label" :title="it.label">{{ it.short ?? it.label }}</span>
    </div>
  </div>
</template>
