<script setup>
import { ref, computed, nextTick, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import logo from '../assets/logo.png';
import { authApi } from '../api/http';
import { useAuth } from '../composables/useAuth';
import LanguageSwitch from '../components/LanguageSwitch.vue';
import { t } from '../i18n';

/**
 * Two-step sign-in (multi-factor):
 *  1. something you know: username + password → the server answers with a short-lived challenge
 *  2. something you have: a 6-digit code from the authenticator app, or sent by email / SMS
 */
const route = useRoute();
const router = useRouter();
const { setUser } = useAuth();

const step = ref('password');
const form = ref({ username: '', password: '' });
const code = ref('');
const challenge = ref(null);
const busy = ref(false);
const error = ref('');
const info = ref('');
const codeInput = ref(null);


// Resend countdown (the server refuses a new code within 30 s)
const wait = ref(0);
let timer;
function startCountdown() {
  wait.value = 30;
  clearInterval(timer);
  timer = setInterval(() => (wait.value = Math.max(0, wait.value - 1)) || clearInterval(timer), 1000);
}
onBeforeUnmount(() => clearInterval(timer));

async function submitPassword() {
  busy.value = true;
  error.value = '';
  try {
    challenge.value = await authApi.login(form.value);
    form.value.password = '';   // not kept in memory longer than needed
    step.value = 'code';
    code.value = '';
    info.value = '';
    if (challenge.value.method !== 'totp') startCountdown();
    await nextTick();
    codeInput.value?.focus();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function submitCode() {
  busy.value = true;
  error.value = '';
  try {
    const user = await authApi.verify({ challenge: challenge.value.challenge, code: code.value });
    setUser(user);
    const next = typeof route.query.next === 'string' && /^\/(?!\/)/.test(route.query.next) ? route.query.next : '/';
    router.replace(user.must_change_password ? '/change-password' : next);
  } catch (e) {
    error.value = e.message;
    code.value = '';
    // Challenge gone (expired, too many attempts, locked): back to the password step
    if (/sign in again|locked/i.test(e.message)) back(e.message);
  } finally {
    busy.value = false;
  }
}

async function resend() {
  error.value = '';
  try {
    const r = await authApi.resend(challenge.value.challenge);
    info.value = t('auth.newCodeSent', { to: r.destination });
    startCountdown();
  } catch (e) {
    error.value = e.message;
  }
}

function back(message = '') {
  step.value = 'password';
  challenge.value = null;
  error.value = message;
}

// Digits only, max 6: also works when the code is pasted with spaces
const onCodeInput = (e) => (code.value = e.target.value.replace(/\D/g, '').slice(0, 6));
const setup = computed(() => challenge.value?.setup);
</script>

<template>
  <div class="auth-page">
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-top"><div class="brand"><img :src="logo" alt="" /><span>School<b>Doc</b></span></div><LanguageSwitch /></div>

        <template v-if="step === 'password'">
          <h1>{{ t('auth.signIn') }}</h1>
          <p class="lead">{{ t('auth.lead') }}</p>
          <div v-if="error" class="alert" role="alert"><AppIcon name="alert" />{{ error }}</div>
          <form @submit.prevent="submitPassword">
            <label class="field">{{ t('auth.username') }}
              <input v-model="form.username" autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus />
            </label>
            <label class="field">{{ t('auth.password') }}
              <input v-model="form.password" type="password" autocomplete="current-password" required />
            </label>
            <button class="btn primary" :disabled="busy">{{ busy ? t('auth.checking') : t('auth.continue') }}</button>
          </form>
        </template>

        <template v-else>
          <h1>{{ setup ? t('auth.setupTitle') : t('auth.codeTitle') }}</h1>
          <p class="lead">
            <template v-if="setup">{{ t('auth.setupLead') }}</template>
            <template v-else>{{ t(`auth.${challenge.method}`) }} <b v-if="challenge.method !== 'totp'">{{ challenge.destination }}</b></template>
          </p>
          <div v-if="error" class="alert" role="alert"><AppIcon name="alert" />{{ error }}</div>
          <div v-if="info" class="alert success"><AppIcon name="check" />{{ info }}</div>
          <form @submit.prevent="submitCode">
            <div v-if="setup" class="qr-box">
              <img :src="setup.qr" :alt="t('auth.qrAlt')" />
              <span class="muted small">{{ t('auth.manualKey') }}</span>
              <code>{{ setup.secret.match(/.{1,4}/g).join(' ') }}</code>
            </div>
            <label class="field">{{ t('auth.code') }}
              <input ref="codeInput" :value="code" class="code-input" inputmode="numeric" autocomplete="one-time-code"
                     maxlength="6" pattern="\d{6}" required :aria-label="t('auth.code')" @input="onCodeInput" />
            </label>
            <button class="btn primary" :disabled="busy || code.length !== 6">{{ busy ? t('auth.verifying') : t('auth.signIn') }}</button>
          </form>
          <div class="auth-foot" style="margin-top: 1rem">
            <button type="button" @click="back()">{{ t('auth.otherAccount') }}</button>
            <button v-if="challenge.method !== 'totp'" type="button" :disabled="wait > 0" @click="resend">
              {{ wait > 0 ? t('auth.resendIn', { n: wait }) : t('auth.resend') }}
            </button>
          </div>
        </template>
      </div>
      <p class="auth-secure"><AppIcon name="lock" size="14" />{{ t('auth.secure') }}</p>
    </div>
  </div>
</template>
