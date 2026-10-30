<script setup>
import AppIcon from '../components/AppIcon.vue';
import { useAuth } from '../composables/useAuth';
import { t } from '../i18n';

const { user } = useAuth();
</script>

<template>
  <section class="card empty" style="padding: 3rem 1.5rem">
    <AppIcon name="lock" size="36" />
    <h2>{{ t('pages.forbidden.title') }}</h2>
    <p class="muted">{{ t('pages.forbidden.text', { role: t(`options.role.${user?.role}`) }) }}</p>
    <RouterLink to="/" class="btn secondary" style="margin-top: 1rem">{{ t('pages.forbidden.back') }}</RouterLink>
  </section>
</template>
