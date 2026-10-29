<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import logo from '../assets/logo.png';
import { authApi } from '../api/http';
import { useAuth } from '../composables/useAuth';

const router = useRouter();
const { user, setUser, logout } = useAuth();
const form = ref({ current_password: '', new_password: '', confirm: '' });
const busy = ref(false);
const error = ref('');

// Same rules as the server (the server stays the authority)
const rules = computed(() => [
  { ok: form.value.new_password.length >= 10, text: 'At least 10 characters' },
  { ok: /[a-zA-Z]/.test(form.value.new_password) && /\d/.test(form.value.new_password), text: 'Letters and digits' },
  { ok: !!form.value.new_password && form.value.new_password === form.value.confirm, text: 'Both entries match' },
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
      <div class="brand"><img :src="logo" alt="" /><span>School<b>Doc</b></span></div>
      <h1>Change your password</h1>
      <p class="lead">
        <template v-if="user?.must_change_password">Your password is temporary: choose your own to continue.</template>
        <template v-else>Your other devices will be signed out.</template>
      </p>
      <div v-if="error" class="alert" role="alert"><AppIcon name="alert" />{{ error }}</div>
      <form @submit.prevent="submit">
        <input type="text" name="username" :value="user?.username" autocomplete="username" hidden />
        <label class="field">Current password
          <input v-model="form.current_password" type="password" autocomplete="current-password" required />
        </label>
        <label class="field">New password
          <input v-model="form.new_password" type="password" autocomplete="new-password" required />
        </label>
        <label class="field">Confirm the new password
          <input v-model="form.confirm" type="password" autocomplete="new-password" required />
        </label>
        <ul class="muted small" style="margin: 0; padding-left: 0; list-style: none; display: grid; gap: .2rem">
          <li v-for="r in rules" :key="r.text" :class="{ 'perm-yes': r.ok }">
            <AppIcon :name="r.ok ? 'check' : 'x'" size="13" /> {{ r.text }}
          </li>
        </ul>
        <button class="btn primary" :disabled="busy || !valid">{{ busy ? 'Saving…' : 'Save my password' }}</button>
        <button type="button" class="btn secondary" @click="cancel">{{ user?.must_change_password ? 'Sign out' : 'Cancel' }}</button>
      </form>
    </div>
  </div>
</template>
