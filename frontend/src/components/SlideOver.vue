<script setup>
import { onMounted, onBeforeUnmount } from 'vue';
import AppIcon from './AppIcon.vue';
import { t } from '../i18n';

// Side panel for forms. <Teleport> renders it under <body> so it overlays the whole layout.
defineProps({ title: String });
const emit = defineEmits(['close']);

const onKey = (e) => e.key === 'Escape' && emit('close');
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <Teleport to="body">
    <div class="overlay" @click.self="emit('close')">
      <aside class="slide-over" role="dialog" :aria-label="title">
        <header>
          <h2>{{ title }}</h2>
          <button class="icon-btn" :aria-label="t('common.close')" @click="emit('close')"><AppIcon name="x" /></button>
        </header>
        <div class="slide-body"><slot /></div>
        <footer><slot name="footer" /></footer>
      </aside>
    </div>
  </Teleport>
</template>
