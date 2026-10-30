<script setup>
import { ref, computed, onMounted } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import SlideOver from '../components/SlideOver.vue';
import StatusBadge from '../components/StatusBadge.vue';
import AppIcon from '../components/AppIcon.vue';
import Avatar from '../components/Avatar.vue';
import PaginationBar from '../components/PaginationBar.vue';
import { usersApi, teachersApi } from '../api/http';
import { usePaginatedList } from '../composables/usePaginatedList';
import { useAuth } from '../composables/useAuth';
import { t, fmtDateTime } from '../i18n';

const { user: me } = useAuth();
const tab = ref('users');
const roles = ref({});
const permissions = ref({});
const teachers = ref([]);
onMounted(async () => {
  ({ roles: roles.value, permissions: permissions.value } = await usersApi.roles());
});

const MFA = ['totp', 'email', 'sms'];
const mfaLabel = (k) => t(`users.mfa.${k}`);
const MFA_ICON = { totp: 'phone', email: 'mail', sms: 'phone' };
const EVENTS = ['login', 'login_failed', 'code_failed', 'locked', 'logout', 'password_changed', 'password_reset', 'mfa_reset', 'unlocked',
  'user_created', 'user_updated', 'user_deleted', 'signed_out', 'admin_created'];
const eventLabel = (e) => (EVENTS.includes(e) ? t(`users.events.${e}`) : e);
// Role names, descriptions and permission texts come from the translations (the API sends English)
const roleLabel = (k) => t(`options.role.${k}`);
const EVENT_TONE = { login_failed: 'danger', code_failed: 'danger', locked: 'danger', login: 'success' };
const when = (d) => fmtDateTime(d);

// ---------- Users list ----------
const { items, total, totalPages, page, pageSize, search, filters, loading, error, load } = usePaginatedList(
  (params) => usersApi.list(params), { filters: { role: '', is_active: '' } });

const statusOf = (u) => (!u.is_active ? ['false', t('users.inactive')] : u.locked ? ['cancelled', t('users.locked')] : u.must_change_password ? ['pending', t('users.mustChange')] : ['active', t('users.active')]);

// ---------- Create / edit ----------
const form = ref(null);
const formError = ref('');
const saving = ref(false);
const detail = ref(null);     // events + sessions of the user being edited
const secret = ref(null);     // { username, password }: shown once after create/reset

async function openForm(u = null) {
  formError.value = '';
  detail.value = null;
  form.value = u
    ? { id: u.id, username: u.username, full_name: u.full_name, email: u.email ?? '', phone: u.phone ?? '', role: u.role, teacher_id: u.teacher_id ?? '', mfa_method: u.mfa_method, is_active: u.is_active }
    : { username: '', full_name: '', email: '', phone: '', role: 'cashier', teacher_id: '', mfa_method: 'email', is_active: true };
  if (!teachers.value.length) teachers.value = await teachersApi.list({ status: 'active' });
  if (u) detail.value = await usersApi.get(u.id);
}

// Picking a teacher fills the name and email from the staff record
function onTeacher() {
  const tc = teachers.value.find((x) => x.id === Number(form.value.teacher_id));
  if (!tc) return;
  form.value.full_name ||= `${tc.first_name} ${tc.last_name}`;
  form.value.email ||= tc.email ?? '';
  form.value.phone ||= tc.phone ?? '';
}

async function submit() {
  saving.value = true;
  formError.value = '';
  try {
    const { id, ...data } = form.value;
    if (data.role !== 'teacher') data.teacher_id = null;
    if (id) {
      await usersApi.update(id, data);
      form.value = null;
    } else {
      const r = await usersApi.create(data);
      secret.value = { username: r.user.username, password: r.temporary_password, created: true };
      form.value = null;
    }
    load();
  } catch (e) {
    formError.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function act(fn, confirmText) {
  if (confirmText && !confirm(confirmText)) return;
  formError.value = '';
  try {
    const r = await fn();
    if (r?.temporary_password) secret.value = { username: form.value.username, password: r.temporary_password };
    detail.value = await usersApi.get(form.value.id);
    load();
  } catch (e) {
    formError.value = e.message;
  }
}
const resetPassword = () => act(() => usersApi.resetPassword(form.value.id), t('users.confirmReset', { name: form.value.full_name }));
const resetMfa = () => act(() => usersApi.resetMfa(form.value.id), t('users.confirmMfa', { name: form.value.full_name }));
const unlock = () => act(() => usersApi.unlock(form.value.id));
const signOutAll = () => act(() => usersApi.signOut(form.value.id), t('users.confirmSignOut', { name: form.value.full_name }));
async function remove() {
  if (!confirm(t('users.confirmDelete', { name: form.value.full_name }))) return;
  try {
    await usersApi.remove(form.value.id);
    form.value = null;
    load();
  } catch (e) {
    formError.value = e.message;
  }
}

const copied = ref(false);
async function copySecret() {
  try {
    await navigator.clipboard.writeText(secret.value.password);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch { /* clipboard blocked: the password stays visible to copy by hand */ }
}

const isSelf = computed(() => form.value?.id === me.value?.id);
const needsEmail = computed(() => form.value?.mfa_method === 'email');
const needsPhone = computed(() => form.value?.mfa_method === 'sms');

// ---------- Roles matrix: permission groups (students, finance...) as rows ----------
const roleKeys = computed(() => Object.keys(roles.value));
const hasPerm = (role, perm) => roles.value[role].permissions.includes('*') || roles.value[role].permissions.includes(perm);

// ---------- Security log ----------
const log = usePaginatedList((params) => usersApi.events(params), { filters: { event: '' } });
</script>

<template>
  <section>
    <PageHeader :title="t('users.title')" :subtitle="t('users.subtitle')">
      <button v-if="tab === 'users'" class="btn primary" @click="openForm()"><AppIcon name="plus" />{{ t('users.new') }}</button>
    </PageHeader>

    <div class="tabs-bar">
      <button :class="{ active: tab === 'users' }" @click="tab = 'users'"><AppIcon name="teachers" size="16" />{{ t('users.tabUsers') }}</button>
      <button :class="{ active: tab === 'roles' }" @click="tab = 'roles'"><AppIcon name="shield" size="16" />{{ t('users.tabRoles') }}</button>
      <button :class="{ active: tab === 'log' }" @click="tab = 'log'; log.load()"><AppIcon name="clock" size="16" />{{ t('users.tabLog') }}</button>
    </div>

    <!-- One-time temporary password -->
    <div v-if="secret" class="card" style="margin-bottom: 1rem; padding: 1rem 1.25rem; display: grid; gap: .6rem">
      <i18n-t keypath="users.forX" tag="p" class="strong" scope="global"><template #what><AppIcon name="key" size="16" /> {{ secret.created ? t('users.created') : t('users.reset') }}</template><template #user><span class="mono">{{ secret.username }}</span></template></i18n-t>
      <div class="secret-box">
        <code>{{ secret.password }}</code>
        <button class="btn secondary" @click="copySecret"><AppIcon :name="copied ? 'check' : 'copy'" size="16" />{{ copied ? t('users.copied') : t('users.copy') }}</button>
      </div>
      <p class="muted small">{{ t('users.secretHelp') }}</p>
      <div><button class="btn secondary" @click="secret = null">{{ t('users.done') }}</button></div>
    </div>

    <template v-if="tab === 'users'">
      <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>
      <div class="card">
        <div class="toolbar filters">
          <label class="search">
            <AppIcon name="search" size="16" />
            <input v-model="search" type="search" :placeholder="t('users.search')" />
          </label>
          <select v-model="filters.role" :aria-label="t('fields.role')">
            <option value="">{{ t('users.allRoles') }}</option>
            <option v-for="(r, key) in roles" :key="key" :value="key">{{ roleLabel(key) }}</option>
          </select>
          <select v-model="filters.is_active" :aria-label="t('common.status')">
            <option value="">{{ t('users.activeAndInactive') }}</option>
            <option value="true">{{ t('users.activeOnly') }}</option>
            <option value="false">{{ t('users.inactiveOnly') }}</option>
          </select>
        </div>
        <div class="table-wrap" :class="{ 'is-loading': loading && items.length }">
          <table class="table">
            <thead><tr><th>{{ t('users.user') }}</th><th>{{ t('fields.role') }}</th><th>{{ t('users.secondFactor') }}</th><th>{{ t('common.status') }}</th><th>{{ t('users.lastSignIn') }}</th><th /></tr></thead>
            <tbody>
              <tr v-for="u in items" :key="u.id" class="clickable" @click="openForm(u)">
                <td>
                  <div class="person">
                    <Avatar :name="u.full_name" :size="32" />
                    <div><div class="strong">{{ u.full_name }}</div><div class="muted small mono">{{ u.username }}</div></div>
                  </div>
                </td>
                <td><span class="pill">{{ roleLabel(u.role) }}</span><div v-if="u.teacher" class="muted small">{{ u.teacher }}</div></td>
                <td><AppIcon :name="MFA_ICON[u.mfa_method]" size="14" /> {{ mfaLabel(u.mfa_method) }}
                  <div v-if="u.mfa_method === 'totp' && !u.totp_confirmed" class="muted small">{{ t('users.qrPending') }}</div></td>
                <td><StatusBadge :value="statusOf(u)[0]" :label="statusOf(u)[1]" /></td>
                <td class="muted small">{{ when(u.last_login_at) }}</td>
                <td class="right"><button class="icon-btn" :title="t('common.edit')" @click.stop="openForm(u)"><AppIcon name="edit" size="16" /></button></td>
              </tr>
            </tbody>
          </table>
          <div v-if="!loading && !items.length" class="empty"><AppIcon name="inbox" size="32" /><p>{{ t('users.none') }}</p></div>
        </div>
        <PaginationBar v-if="total" v-model:page="page" v-model:page-size="pageSize" :total="total" :total-pages="totalPages" />
      </div>
    </template>

    <template v-else-if="tab === 'roles'">
      <div class="role-cards">
        <div v-for="(r, key) in roles" :key="key" class="card role-card">
          <p class="strong"><AppIcon :name="key === 'admin' ? 'shield' : 'teachers'" size="16" /> {{ roleLabel(key) }}</p>
          <p class="muted small">{{ t(`options.roleDescription.${key}`) }}</p>
        </div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table class="table perm-matrix">
            <thead><tr><th>{{ t('users.permission') }}</th><th v-for="k in roleKeys" :key="k">{{ k === 'admin' ? t('users.admin') : roleLabel(k) }}</th></tr></thead>
            <tbody>
              <tr v-for="(label, perm) in permissions" :key="perm">
                <td><div class="strong small">{{ t(`options.permission.${perm}`) }}</div><div class="muted small mono">{{ perm }}</div></td>
                <td v-for="k in roleKeys" :key="k">
                  <AppIcon v-if="hasPerm(k, perm)" name="check" size="16" class="perm-yes" :aria-label="t('users.yesFor', { role: roleLabel(k) })" />
                  <span v-else class="perm-no" :aria-label="t('common.no')">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p class="muted small" style="margin-top: .75rem">{{ t('users.rolesNote') }}</p>
    </template>

    <template v-else>
      <div class="card">
        <div class="toolbar filters">
          <label class="search">
            <AppIcon name="search" size="16" />
            <input v-model="log.search.value" type="search" :placeholder="t('users.searchLog')" />
          </label>
          <select v-model="log.filters.event" :aria-label="t('users.event')">
            <option value="">{{ t('users.allEvents') }}</option>
            <option v-for="key in EVENTS" :key="key" :value="key">{{ eventLabel(key) }}</option>
          </select>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>{{ t('users.when') }}</th><th>{{ t('users.user') }}</th><th>{{ t('users.event') }}</th><th>{{ t('users.detail') }}</th><th>IP</th></tr></thead>
            <tbody>
              <tr v-for="e in log.items.value" :key="e.id">
                <td class="small">{{ when(e.created_at) }}</td>
                <td class="mono small">{{ e.username ?? '—' }}</td>
                <td><StatusBadge :value="EVENT_TONE[e.event] === 'danger' ? 'cancelled' : EVENT_TONE[e.event] === 'success' ? 'active' : 'left'" :label="eventLabel(e.event)" /></td>
                <td class="muted small wrap">{{ e.detail ?? '' }}</td>
                <td class="muted small mono">{{ e.ip }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <PaginationBar v-if="log.total.value" v-model:page="log.page.value" v-model:page-size="log.pageSize.value" :total="log.total.value" :total-pages="log.totalPages.value" />
      </div>
    </template>

    <SlideOver v-if="form" :title="form.id ? form.full_name : t('users.new')" @close="form = null">
      <div v-if="formError" class="alert"><AppIcon name="alert" />{{ formError }}</div>
      <form id="user-form" class="form-grid" @submit.prevent="submit">
        <label class="field wide"><span>{{ t('fields.role') }}<b class="req">*</b></span>
          <select v-model="form.role" :disabled="isSelf">
            <option v-for="(r, key) in roles" :key="key" :value="key">{{ roleLabel(key) }}</option>
          </select>
          <span class="muted small">{{ t(`options.roleDescription.${form.role}`) }}</span>
        </label>
        <label v-if="form.role === 'teacher'" class="field wide"><span>{{ t('users.teacherRecord') }}<b class="req">*</b></span>
          <select v-model="form.teacher_id" required @change="onTeacher">
            <option value="">{{ t('users.chooseTeacher') }}</option>
            <option v-for="tc in teachers" :key="tc.id" :value="tc.id">{{ tc.last_name }} {{ tc.first_name }} · {{ tc.specialty }}</option>
          </select>
        </label>
        <label class="field"><span>{{ t('fields.username') }}<b class="req">*</b></span>
          <input v-model="form.username" :disabled="!!form.id" required pattern="[a-zA-Z0-9._\-]{3,40}" autocapitalize="none" :placeholder="t('users.usernameHint')" />
        </label>
        <label class="field"><span>{{ t('fields.fullName') }}<b class="req">*</b></span><input v-model="form.full_name" required /></label>
        <label class="field"><span>{{ t('fields.email') }}<b v-if="needsEmail" class="req">*</b></span><input v-model="form.email" type="email" :required="needsEmail" /></label>
        <label class="field"><span>{{ t('users.mobile') }}<b v-if="needsPhone" class="req">*</b></span><input v-model="form.phone" type="tel" :required="needsPhone" placeholder="+237 6 99 12 34 56" /></label>
        <fieldset class="field wide" style="border: 0; padding: 0; margin: 0">
          <legend style="margin-bottom: .35rem">{{ t('users.mfaAtSignIn') }}</legend>
          <div class="segmented" style="margin: 0">
            <button v-for="key in MFA" :key="key" type="button" :class="{ active: form.mfa_method === key }" @click="form.mfa_method = key">
              <AppIcon :name="MFA_ICON[key]" size="14" />{{ mfaLabel(key) }}
            </button>
          </div>
        </fieldset>
        <label v-if="form.id" class="field wide checkbox">
          <input v-model="form.is_active" type="checkbox" :disabled="isSelf" /> {{ t('users.activeHelp') }}
        </label>
      </form>

      <template v-if="detail">
        <h3 class="section-title">{{ t('users.security') }}</h3>
        <div class="kv small">
          <span class="muted">{{ t('users.lastSignIn') }}</span><span>{{ when(detail.last_login_at) }}</span>
          <span class="muted">{{ t('users.passwordChanged') }}</span><span>{{ when(detail.password_changed_at) }}</span>
          <span class="muted">{{ t('users.sessions') }}</span><span>{{ detail.active_sessions }}</span>
          <span v-if="detail.locked" class="muted">{{ t('users.lockedUntil') }}</span><span v-if="detail.locked" style="color: var(--danger)">{{ when(detail.locked_until) }}</span>
        </div>
        <div class="toolbar" style="flex-wrap: wrap; gap: .5rem; margin: .75rem 0 0">
          <button type="button" class="btn secondary" @click="resetPassword"><AppIcon name="key" size="16" />{{ t('users.resetPassword') }}</button>
          <button v-if="detail.mfa_method === 'totp'" type="button" class="btn secondary" @click="resetMfa"><AppIcon name="refresh" size="16" />{{ t('users.resetMfa') }}</button>
          <button v-if="detail.locked" type="button" class="btn secondary" @click="unlock"><AppIcon name="unlock" size="16" />{{ t('users.unlock') }}</button>
          <button v-if="detail.active_sessions && !isSelf" type="button" class="btn secondary" @click="signOutAll"><AppIcon name="logout" size="16" />{{ t('users.endSessions') }}</button>
          <button v-if="!isSelf" type="button" class="btn secondary danger" @click="remove"><AppIcon name="trash" size="16" />{{ t('common.delete') }}</button>
        </div>
        <h3 class="section-title">{{ t('users.activity') }}</h3>
        <ul class="timeline small">
          <li v-for="e in detail.events" :key="e.id">
            <StatusBadge :value="EVENT_TONE[e.event] === 'danger' ? 'cancelled' : EVENT_TONE[e.event] === 'success' ? 'active' : 'left'" :label="eventLabel(e.event)" />
            <span class="muted">{{ when(e.created_at) }}{{ e.ip ? ` · ${e.ip}` : '' }}{{ e.detail ? ` · ${e.detail}` : '' }}</span>
          </li>
          <li v-if="!detail.events.length" class="muted">{{ t('users.noActivity') }}</li>
        </ul>
      </template>

      <template #footer>
        <button class="btn secondary" @click="form = null">{{ t('common.cancel') }}</button>
        <button type="submit" form="user-form" class="btn primary" :disabled="saving">{{ saving ? t('common.saving') : form.id ? t('common.save') : t('users.createAccount') }}</button>
      </template>
    </SlideOver>
  </section>
</template>

<style scoped>
.role-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: .75rem; margin-bottom: 1rem; }
.role-card { padding: 1rem; display: grid; gap: .3rem; align-content: start; }
.section-title { margin: 1.5rem 0 .6rem; font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.kv { display: grid; grid-template-columns: max-content 1fr; gap: .35rem 1rem; }
.timeline { list-style: none; padding: 0; margin: 0; display: grid; gap: .5rem; }
.timeline li { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
.checkbox { flex-direction: row; align-items: center; gap: .5rem; }
.person { display: flex; align-items: center; gap: .6rem; }
tr.clickable { cursor: pointer; }
</style>
