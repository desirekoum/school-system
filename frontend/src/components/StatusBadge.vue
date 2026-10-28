<script setup>
// Maps any status value to a color tone; unknown values fall back to neutral
const TONES = {
  active: 'success', confirmed: 'success',
  pending: 'warning', on_leave: 'warning', transferred: 'warning',
  cancelled: 'danger', expelled: 'danger', left: 'neutral',
  graduated: 'info',
};
defineProps({ value: String, label: String });
</script>

<template>
  <span v-if="value" :class="['badge', TONES[value] ?? 'neutral']"><i class="dot" />{{ label ?? value }}</span>
  <span v-else class="muted">—</span>
</template>
