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

const { user: me } = useAuth();
const tab = ref('users');
const roles = ref({});
const permissions = ref({});
const teachers = ref([]);
onMounted(async () => {
  ({ roles: roles.value, permissions: permissions.value } = await usersApi.roles());
});

const MFA = { totp: 'Authenticator app', email: 'Email code', sms: 'SMS code' };
const MFA_ICON = { totp: 'phone', email: 'mail', sms: 'phone' };
const EVENT_LABELS = {
  login: 'Signed in', login_failed: 'Failed sign-in', code_failed: 'Wrong code', locked: 'Account locked', logout: 'Signed out',
  password_changed: 'Password changed', password_reset: 'Password reset', mfa_reset: 'Authenticator reset', unlocked: 'Unlocked',
  user_created: 'Account created', user_updated: 'Account updated', user_deleted: 'Account deleted', signed_out: 'Sessions ended',
  admin_created: 'Admin created',
};
const EVENT_TONE = { login_failed: 'danger', code_failed: 'danger', locked: 'danger', login: 'success' };
const when = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');

// ---------- Users list ----------
const { items, total, totalPages, page, pageSize, search, filters, loading, error, load } = usePaginatedList(
  (params) => usersApi.list(params), { filters: { role: '', is_active: '' } });

const statusOf = (u) => (!u.is_active ? ['false', 'Inactive'] : u.locked ? ['cancelled', 'Locked'] : u.must_change_password ? ['pending', 'Must change password'] : ['active', 'Active']);

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
  const t = teachers.value.find((x) => x.id === Number(form.value.teacher_id));
  if (!t) return;
  form.value.full_name ||= `${t.first_name} ${t.last_name}`;
  form.value.email ||= t.email ?? '';
  form.value.phone ||= t.phone ?? '';
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
const resetPassword = () => act(() => usersApi.resetPassword(form.value.id), `Reset the password of ${form.value.full_name}? Their sessions end and a temporary password is created.`);
const resetMfa = () => act(() => usersApi.resetMfa(form.value.id), `Reset the authenticator of ${form.value.full_name}? They scan a new QR code at the next sign-in.`);
const unlock = () => act(() => usersApi.unlock(form.value.id));
const signOutAll = () => act(() => usersApi.signOut(form.value.id), `End every open session of ${form.value.full_name}?`);
async function remove() {
  if (!confirm(`Delete the account of ${form.value.full_name}? Deactivating keeps the history and is usually better.`)) return;
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
    <PageHeader title="Users & roles" subtitle="Accounts that can sign in, what each role may do, and the security log.">
      <button v-if="tab === 'users'" class="btn primary" @click="openForm()"><AppIcon name="plus" />New user</button>
    </PageHeader>

    <div class="tabs-bar">
      <button :class="{ active: tab === 'users' }" @click="tab = 'users'"><AppIcon name="teachers" size="16" />Users</button>
      <button :class="{ active: tab === 'roles' }" @click="tab = 'roles'"><AppIcon name="shield" size="16" />Roles & permissions</button>
      <button :class="{ active: tab === 'log' }" @click="tab = 'log'; log.load()"><AppIcon name="clock" size="16" />Security log</button>
    </div>

    <!-- One-time temporary password -->
    <div v-if="secret" class="card" style="margin-bottom: 1rem; padding: 1rem 1.25rem; display: grid; gap: .6rem">
      <p class="strong"><AppIcon name="key" size="16" /> {{ secret.created ? 'Account created' : 'Password reset' }} for <span class="mono">{{ secret.username }}</span></p>
      <div class="secret-box">
        <code>{{ secret.password }}</code>
        <button class="btn secondary" @click="copySecret"><AppIcon :name="copied ? 'check' : 'copy'" size="16" />{{ copied ? 'Copied' : 'Copy' }}</button>
      </div>
      <p class="muted small">Give this temporary password to the user in person. It is shown only once; they must change it at their first sign-in.</p>
      <div><button class="btn secondary" @click="secret = null">Done</button></div>
    </div>

    <template v-if="tab === 'users'">
      <div v-if="error" class="alert"><AppIcon name="alert" />{{ error }}</div>
      <div class="card">
        <div class="toolbar filters">
          <label class="search">
            <AppIcon name="search" size="16" />
            <input v-model="search" type="search" placeholder="Name, username, email, phone…" />
          </label>
          <select v-model="filters.role" aria-label="Role">
            <option value="">All roles</option>
            <option v-for="(r, key) in roles" :key="key" :value="key">{{ r.label }}</option>
          </select>
          <select v-model="filters.is_active" aria-label="Status">
            <option value="">Active and inactive</option>
            <option value="true">Active only</option>
            <option value="false">Inactive only</option>
          </select>
        </div>
        <div class="table-wrap" :class="{ 'is-loading': loading && items.length }">
          <table class="table">
            <thead><tr><th>User</th><th>Role</th><th>Second factor</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
            <tbody>
              <tr v-for="u in items" :key="u.id" class="clickable" @click="openForm(u)">
                <td>
                  <div class="person">
                    <Avatar :name="u.full_name" :size="32" />
                    <div><div class="strong">{{ u.full_name }}</div><div class="muted small mono">{{ u.username }}</div></div>
                  </div>
                </td>
                <td><span class="pill">{{ roles[u.role]?.label ?? u.role }}</span><div v-if="u.teacher" class="muted small">{{ u.teacher }}</div></td>
                <td><AppIcon :name="MFA_ICON[u.mfa_method]" size="14" /> {{ MFA[u.mfa_method] }}
                  <div v-if="u.mfa_method === 'totp' && !u.totp_confirmed" class="muted small">QR not scanned yet</div></td>
                <td><StatusBadge :value="statusOf(u)[0]" :label="statusOf(u)[1]" /></td>
                <td class="muted small">{{ when(u.last_login_at) }}</td>
                <td class="right"><button class="icon-btn" title="Edit" @click.stop="openForm(u)"><AppIcon name="edit" size="16" /></button></td>
              </tr>
            </tbody>
          </table>
          <div v-if="!loading && !items.length" class="empty"><AppIcon name="inbox" size="32" /><p>No user matches.</p></div>
        </div>
        <PaginationBar v-if="total" v-model:page="page" v-model:page-size="pageSize" :total="total" :total-pages="totalPages" />
      </div>
    </template>

    <template v-else-if="tab === 'roles'">
      <div class="role-cards">
        <div v-for="(r, key) in roles" :key="key" class="card role-card">
          <p class="strong"><AppIcon :name="key === 'admin' ? 'shield' : 'teachers'" size="16" /> {{ r.label }}</p>
          <p class="muted small">{{ r.description }}</p>
        </div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table class="table perm-matrix">
            <thead><tr><th>Permission</th><th v-for="k in roleKeys" :key="k">{{ roles[k].label.replace('System administrator', 'Admin') }}</th></tr></thead>
            <tbody>
              <tr v-for="(label, perm) in permissions" :key="perm">
                <td><div class="strong small">{{ label }}</div><div class="muted small mono">{{ perm }}</div></td>
                <td v-for="k in roleKeys" :key="k">
                  <AppIcon v-if="hasPerm(k, perm)" name="check" size="16" class="perm-yes" :aria-label="`${roles[k].label}: yes`" />
                  <span v-else class="perm-no" aria-label="no">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p class="muted small" style="margin-top: .75rem">Roles are defined in the code (backend/src/modules/auth/roles.js), so every change is reviewed. Teachers can only grade the courses assigned to them.</p>
    </template>

    <template v-else>
      <div class="card">
        <div class="toolbar filters">
          <label class="search">
            <AppIcon name="search" size="16" />
            <input v-model="log.search.value" type="search" placeholder="Username, IP, detail…" />
          </label>
          <select v-model="log.filters.event" aria-label="Event">
            <option value="">All events</option>
            <option v-for="(label, key) in EVENT_LABELS" :key="key" :value="key">{{ label }}</option>
          </select>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>When</th><th>User</th><th>Event</th><th>Detail</th><th>IP</th></tr></thead>
            <tbody>
              <tr v-for="e in log.items.value" :key="e.id">
                <td class="small">{{ when(e.created_at) }}</td>
                <td class="mono small">{{ e.username ?? '—' }}</td>
                <td><StatusBadge :value="EVENT_TONE[e.event] === 'danger' ? 'cancelled' : EVENT_TONE[e.event] === 'success' ? 'active' : 'left'" :label="EVENT_LABELS[e.event] ?? e.event" /></td>
                <td class="muted small wrap">{{ e.detail ?? '' }}</td>
                <td class="muted small mono">{{ e.ip }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <PaginationBar v-if="log.total.value" v-model:page="log.page.value" v-model:page-size="log.pageSize.value" :total="log.total.value" :total-pages="log.totalPages.value" />
      </div>
    </template>

    <SlideOver v-if="form" :title="form.id ? form.full_name : 'New user'" @close="form = null">
      <div v-if="formError" class="alert"><AppIcon name="alert" />{{ formError }}</div>
      <form id="user-form" class="form-grid" @submit.prevent="submit">
        <label class="field wide"><span>Role<b class="req">*</b></span>
          <select v-model="form.role" :disabled="isSelf">
            <option v-for="(r, key) in roles" :key="key" :value="key">{{ r.label }}</option>
          </select>
          <span class="muted small">{{ roles[form.role]?.description }}</span>
        </label>
        <label v-if="form.role === 'teacher'" class="field wide"><span>Teacher record<b class="req">*</b></span>
          <select v-model="form.teacher_id" required @change="onTeacher">
            <option value="">Choose the teacher…</option>
            <option v-for="t in teachers" :key="t.id" :value="t.id">{{ t.last_name }} {{ t.first_name }} · {{ t.specialty }}</option>
          </select>
        </label>
        <label class="field"><span>Username<b class="req">*</b></span>
          <input v-model="form.username" :disabled="!!form.id" required pattern="[a-zA-Z0-9._\-]{3,40}" autocapitalize="none" placeholder="e.g. j.mballa" />
        </label>
        <label class="field"><span>Full name<b class="req">*</b></span><input v-model="form.full_name" required /></label>
        <label class="field"><span>Email<b v-if="needsEmail" class="req">*</b></span><input v-model="form.email" type="email" :required="needsEmail" /></label>
        <label class="field"><span>Mobile phone<b v-if="needsPhone" class="req">*</b></span><input v-model="form.phone" type="tel" :required="needsPhone" placeholder="+237 6 99 12 34 56" /></label>
        <fieldset class="field wide" style="border: 0; padding: 0; margin: 0">
          <legend style="margin-bottom: .35rem">Second factor at sign-in</legend>
          <div class="segmented" style="margin: 0">
            <button v-for="(label, key) in MFA" :key="key" type="button" :class="{ active: form.mfa_method === key }" @click="form.mfa_method = key">
              <AppIcon :name="MFA_ICON[key]" size="14" />{{ label }}
            </button>
          </div>
        </fieldset>
        <label v-if="form.id" class="field wide checkbox">
          <input v-model="form.is_active" type="checkbox" :disabled="isSelf" /> Account active (an inactive user cannot sign in)
        </label>
      </form>

      <template v-if="detail">
        <h3 class="section-title">Security</h3>
        <div class="kv small">
          <span class="muted">Last sign-in</span><span>{{ when(detail.last_login_at) }}</span>
          <span class="muted">Password changed</span><span>{{ when(detail.password_changed_at) }}</span>
          <span class="muted">Open sessions</span><span>{{ detail.active_sessions }}</span>
          <span v-if="detail.locked" class="muted">Locked until</span><span v-if="detail.locked" style="color: var(--danger)">{{ when(detail.locked_until) }}</span>
        </div>
        <div class="toolbar" style="flex-wrap: wrap; gap: .5rem; margin: .75rem 0 0">
          <button type="button" class="btn secondary" @click="resetPassword"><AppIcon name="key" size="16" />Reset password</button>
          <button v-if="detail.mfa_method === 'totp'" type="button" class="btn secondary" @click="resetMfa"><AppIcon name="refresh" size="16" />Reset authenticator</button>
          <button v-if="detail.locked" type="button" class="btn secondary" @click="unlock"><AppIcon name="unlock" size="16" />Unlock</button>
          <button v-if="detail.active_sessions && !isSelf" type="button" class="btn secondary" @click="signOutAll"><AppIcon name="logout" size="16" />End sessions</button>
          <button v-if="!isSelf" type="button" class="btn secondary danger" @click="remove"><AppIcon name="trash" size="16" />Delete</button>
        </div>
        <h3 class="section-title">Recent activity</h3>
        <ul class="timeline small">
          <li v-for="e in detail.events" :key="e.id">
            <StatusBadge :value="EVENT_TONE[e.event] === 'danger' ? 'cancelled' : EVENT_TONE[e.event] === 'success' ? 'active' : 'left'" :label="EVENT_LABELS[e.event] ?? e.event" />
            <span class="muted">{{ when(e.created_at) }}{{ e.ip ? ` · ${e.ip}` : '' }}{{ e.detail ? ` · ${e.detail}` : '' }}</span>
          </li>
          <li v-if="!detail.events.length" class="muted">No activity yet.</li>
        </ul>
      </template>

      <template #footer>
        <button class="btn secondary" @click="form = null">Cancel</button>
        <button type="submit" form="user-form" class="btn primary" :disabled="saving">{{ saving ? 'Saving…' : form.id ? 'Save' : 'Create account' }}</button>
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
