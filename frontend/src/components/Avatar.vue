<script setup>
import { computed } from 'vue';

const props = defineProps({ name: String, src: String, size: { type: Number, default: 34 } });
const initials = computed(() =>
  (props.name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join(''));
</script>

<template>
  <img v-if="src" :src="src" :alt="name" class="avatar" :style="{ width: `${size}px`, height: `${size}px` }" />
  <span v-else class="avatar" :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.38}px` }">{{ initials }}</span>
</template>
