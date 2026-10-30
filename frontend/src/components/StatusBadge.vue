<script setup>
import { t, te } from '../i18n';

// Maps any status value to a color tone; unknown values fall back to neutral
const TONES = {
  active: 'success', confirmed: 'success',
  pending: 'warning', on_leave: 'warning', transferred: 'warning',
  cancelled: 'danger', expelled: 'danger', left: 'neutral',
  graduated: 'info',
  // finances
  paid: 'success', approved: 'success', partial: 'warning', requested: 'info',
  unpaid: 'danger', overdue: 'danger', rejected: 'danger', voided: 'neutral', upcoming: 'neutral',
  // attendance
  present: 'success', absent: 'danger', late: 'warning', excused: 'info', open: 'info', taken: 'success', missed: 'danger', closed: 'neutral',
  // booleans (e.g. item on sale / withdrawn)
  true: 'success', false: 'neutral',
};
defineProps({ value: [String, Boolean], label: String });
</script>

<template>
  <span v-if="value !== undefined && value !== null && value !== ''" :class="['badge', TONES[value] ?? 'neutral']"><i class="dot" />{{ label ?? (te(`options.status.${value}`) ? t(`options.status.${value}`) : value) }}</span>
  <span v-else class="muted">—</span>
</template>
