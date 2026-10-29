<script setup>
import { ref, computed, nextTick, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import logo from '../assets/logo.png';
import { authApi } from '../api/http';
import { useAuth } from '../composables/useAuth';

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

const METHOD_TEXT = {
  totp: 'Enter the 6-digit code shown in your authenticator app.',
  email: 'We sent a 6-digit code by email to',
  sms: 'We sent a 6-digit code by SMS to',
};

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
    info.value = `A new code was sent to ${r.destination}.`;
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
        <div class="brand"><img :src="logo" alt="" /><span>School<b>Doc</b></span></div>

        <template v-if="step === 'password'">
          <h1>Sign in</h1>
          <p class="lead">Use the account given by your system administrator.</p>
          <div v-if="error" class="alert" role="alert"><AppIcon name="alert" />{{ error }}</div>
          <form @submit.prevent="submitPassword">
            <label class="field">Username
              <input v-model="form.username" autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus />
            </label>
            <label class="field">Password
              <input v-model="form.password" type="password" autocomplete="current-password" required />
            </label>
            <button class="btn primary" :disabled="busy">{{ busy ? 'Checking…' : 'Continue' }}</button>
          </form>
        </template>

        <template v-else>
          <h1>{{ setup ? 'Set up your authenticator' : 'Verification code' }}</h1>
          <p class="lead">
            <template v-if="setup">Scan this QR code with Google Authenticator, Microsoft Authenticator or Authy, then enter the code it shows.</template>
            <template v-else>{{ METHOD_TEXT[challenge.method] }} <b v-if="challenge.method !== 'totp'">{{ challenge.destination }}</b></template>
          </p>
          <div v-if="error" class="alert" role="alert"><AppIcon name="alert" />{{ error }}</div>
          <div v-if="info" class="alert success"><AppIcon name="check" />{{ info }}</div>
          <form @submit.prevent="submitCode">
            <div v-if="setup" class="qr-box">
              <img :src="setup.qr" alt="QR code to scan with an authenticator app" />
              <span class="muted small">Can't scan? Enter this key manually:</span>
              <code>{{ setup.secret.match(/.{1,4}/g).join(' ') }}</code>
            </div>
            <label class="field">6-digit code
              <input ref="codeInput" :value="code" class="code-input" inputmode="numeric" autocomplete="one-time-code"
                     maxlength="6" pattern="\d{6}" required aria-label="6-digit code" @input="onCodeInput" />
            </label>
            <button class="btn primary" :disabled="busy || code.length !== 6">{{ busy ? 'Verifying…' : 'Sign in' }}</button>
          </form>
          <div class="auth-foot" style="margin-top: 1rem">
            <button type="button" @click="back()">← Use another account</button>
            <button v-if="challenge.method !== 'totp'" type="button" :disabled="wait > 0" @click="resend">
              {{ wait > 0 ? `Resend code in ${wait} s` : 'Resend code' }}
            </button>
          </div>
        </template>
      </div>
      <p class="auth-secure"><AppIcon name="lock" size="14" />Encrypted connection (HTTPS) · two-step verification</p>
    </div>
  </div>
</template>
