<script setup>
import { ref, computed } from 'vue';

/**
 * Small SVG line/area chart, no library: points are scaled into a fixed viewBox and the SVG
 * stretches to the card width (preserveAspectRatio="none"); labels are HTML so text never distorts.
 */
const props = defineProps({
  points: { type: Array, required: true },     // [{ label, value }]
  min: { type: Number, default: null },
  max: { type: Number, default: null },
  height: { type: Number, default: 160 },
  format: { type: Function, default: (v) => v },
  labelFormat: { type: Function, default: (l) => l },
  target: { type: Number, default: null },     // dashed reference line, e.g. 90 %
});
const W = 600;
const hover = ref(null);

const values = computed(() => props.points.map((p) => p.value).filter((v) => v != null));
const lo = computed(() => props.min ?? Math.min(...values.value, props.target ?? Infinity));
const hi = computed(() => props.max ?? Math.max(...values.value, props.target ?? -Infinity));
const x = (i) => (props.points.length < 2 ? W / 2 : (i / (props.points.length - 1)) * W);
const y = (v) => props.height - 8 - ((v - lo.value) / (hi.value - lo.value || 1)) * (props.height - 16);
const line = computed(() => props.points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' '));
const area = computed(() => props.points.length ? `${line.value} L${x(props.points.length - 1)},${props.height} L0,${props.height} Z` : '');

function move(e) {
  const r = e.currentTarget.getBoundingClientRect();
  const i = Math.round(((e.clientX - r.left) / r.width) * (props.points.length - 1));
  hover.value = Math.max(0, Math.min(props.points.length - 1, i));
}
const tickIdx = computed(() => {
  const n = props.points.length;
  if (n <= 6) return props.points.map((_, i) => i);
  return [0, Math.round(n / 3), Math.round((2 * n) / 3), n - 1];
});
</script>

<template>
  <div class="chart line-chart" :style="{ height: `${height + 22}px` }">
    <div class="chart-plot" :style="{ height: `${height}px` }" @mousemove="move" @mouseleave="hover = null">
      <svg :viewBox="`0 0 ${W} ${height}`" preserveAspectRatio="none" role="img" :aria-label="`Chart of ${points.length} values`">
        <path :d="area" class="chart-area" />
        <line v-if="target != null" x1="0" :x2="W" :y1="y(target)" :y2="y(target)" class="chart-target" />
        <path :d="line" class="chart-line" vector-effect="non-scaling-stroke" />
        <line v-if="hover !== null" :x1="x(hover)" :x2="x(hover)" y1="0" :y2="height" class="chart-cursor" vector-effect="non-scaling-stroke" />
      </svg>
      <span v-if="hover !== null" class="chart-dot" :style="{ left: `${(x(hover) / W) * 100}%`, top: `${y(points[hover].value)}px` }" />
      <div v-if="hover !== null" class="chart-tip" :style="{ left: `${(x(hover) / W) * 100}%` }">
        <b>{{ format(points[hover].value) }}</b><span>{{ labelFormat(points[hover].label) }}</span>
      </div>
    </div>
    <div class="chart-x">
      <span v-for="i in tickIdx" :key="i" :style="{ left: `${(x(i) / W) * 100}%` }">{{ labelFormat(points[i].label) }}</span>
    </div>
  </div>
</template>
