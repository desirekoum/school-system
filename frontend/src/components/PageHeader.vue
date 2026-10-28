<script setup>
defineProps({ title: String, subtitle: String, back: Object }); // back = { to, label }
</script>

<template>
  <header class="page-header">
    <div>
      <RouterLink v-if="back" :to="back.to" class="back-link">← {{ back.label }}</RouterLink>
      <h1>{{ title }}</h1>
      <p v-if="subtitle" class="muted">{{ subtitle }}</p>
    </div>
    <div class="page-actions"><slot /></div>
  </header>
</template>
