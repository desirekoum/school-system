<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import logo from '../assets/logo.png';
import { authApi } from '../api/http';
import { useAuth } from '../composables/useAuth';
import LanguageSwitch from '../components/LanguageSwitch.vue';
import { t } from '../i18n';

const router = useRouter();
const { user, setUser, logout } = useAuth();
const form = ref({ current_password: '', new_password: '', confirm: '' });
const busy = ref(false);
const error = ref('');

// Same rules as the server (the server stays the authority)
const rules = computed(() => [
  { ok: form.value.new_password.length >= 10, text: t('auth.ruleLength') },
  { ok: /[a-zA-Z]/.test(form.value.new_password) && /\d/.test(form.value.new_password), text: t('auth.ruleMix') },
  { ok: !!form.value.new_password && form.value.new_password === form.value.confirm, text: t('auth.ruleMatch') },
]);
const valid = computed(() => rules.value.every((r) => r.ok));

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    setUser(await authApi.changePassword(form.value));
    router.replace('/');
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function cancel() {
  if (user.value?.must_change_password) {
    await logout();
    router.replace('/login');
  } else router.back();
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-top"><div class="brand"><img :src="logo" alt="" /><span>School<b>Doc</b></span></div><LanguageSwitch /></div>
      <h1>{{ t('auth.changeTitle') }}</h1>
      <p class="lead">
        <template v-if="user?.must_change_password">{{ t('auth.temporary') }}</template>
        <template v-else>{{ t('auth.otherDevices') }}</template>
      </p>
      <div v-if="error" class="alert" role="alert"><AppIcon name="alert" />{{ error }}</div>
      <form @submit.prevent="submit">
        <input type="text" name="username" :value="user?.username" autocomplete="username" hidden />
        <label class="field">{{ t('auth.current') }}
          <input v-model="form.current_password" type="password" autocomplete="current-password" required />
        </label>
        <label class="field">{{ t('auth.new') }}
          <input v-model="form.new_password" type="password" autocomplete="new-password" required />
        </label>
        <label class="field">{{ t('auth.confirm') }}
          <input v-model="form.confirm" type="password" autocomplete="new-password" required />
        </label>
        <ul class="muted small" style="margin: 0; padding-left: 0; list-style: none; display: grid; gap: .2rem">
          <li v-for="r in rules" :key="r.text" :class="{ 'perm-yes': r.ok }">
            <AppIcon :name="r.ok ? 'check' : 'x'" size="13" /> {{ r.text }}
          </li>
        </ul>
        <button class="btn primary" :disabled="busy || !valid">{{ busy ? t('common.saving') : t('auth.saveMine') }}</button>
        <button type="button" class="btn secondary" @click="cancel">{{ user?.must_change_password ? t('nav.signOut') : t('common.cancel') }}</button>
      </form>
    </div>
  </div>
</template>
