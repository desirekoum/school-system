<script setup>
import AppIcon from '../components/AppIcon.vue';
import { useAuth } from '../composables/useAuth';

const { user } = useAuth();
</script>

<template>
  <section class="card empty" style="padding: 3rem 1.5rem">
    <AppIcon name="lock" size="36" />
    <h2>Access restricted</h2>
    <p class="muted">Your role ({{ user?.role_label }}) cannot open this page. Ask your system administrator if you need it.</p>
    <RouterLink to="/" class="btn secondary" style="margin-top: 1rem">Back to the dashboard</RouterLink>
  </section>
</template>
