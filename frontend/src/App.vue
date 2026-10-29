<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppIcon from './components/AppIcon.vue';
import Avatar from './components/Avatar.vue';
import logo from './assets/logo.png';
import { useAuth } from './composables/useAuth';

const nav = [
  { group: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: 'dashboard', exact: true }] },
  { group: 'People', items: [
    { to: '/students', perm: 'students:read', label: 'Students', icon: 'students' },
    { to: '/teachers', perm: 'staff:read', label: 'Teachers', icon: 'teachers' },
  ] },
  { group: 'Academics', items: [
    { to: '/academic-years', perm: 'academics:read', label: 'Academic years', icon: 'calendar' },
    { to: '/registrations', perm: 'registrations:read', label: 'Registrations', icon: 'registrations' },
    { to: '/classes', perm: 'academics:read', label: 'Classes', icon: 'classes' },
    { to: '/courses', perm: 'academics:read', label: 'Courses', icon: 'courses' },
  ] },
  { group: 'Finances', items: [
    { to: '/finances', perm: 'finance:read', label: 'Tuition & accounts', icon: 'wallet', exact: true },
    { to: '/finances/payments', perm: 'finance:read', label: 'Tuition payments', icon: 'receipt' },
    { to: '/finances/sales', perm: 'sales:read', label: 'Sales', icon: 'cart' },
    { to: '/finances/items', perm: 'items:read', label: 'Items for sale', icon: 'tag' },
    { to: '/finances/expenses', perm: 'expenses:read', label: 'Expenses', icon: 'expense' },
    { to: '/finances/reports', perm: 'reports:read', label: 'Financial reports', icon: 'chart' },
  ] },
  { group: 'Administration', items: [{ to: '/users', perm: 'users:manage', label: 'Users & roles', icon: 'shield' }] },
];

// Only the pages the role can open; a group with no page left is hidden
const { user, can, logout } = useAuth();
const visibleNav = computed(() => nav
  .map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || can(i.perm)) }))
  .filter((g) => g.items.length));

const router = useRouter();
async function signOut() {
  await logout();
  router.replace('/login');
}

// School year starts in September (month index 8)
const now = new Date();
const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
const academicYear = `${startYear}–${startYear + 1}`;

// Mobile: sidebar is an off-canvas drawer, closed on every navigation
const open = ref(false);
const route = useRoute();
watch(() => route.fullPath, () => (open.value = false));
// Sign-in and change-password pages are shown without the sidebar
const bare = computed(() => route.meta.public || route.meta.bare);
</script>

<template>
  <RouterView v-if="bare" />
  <div v-else class="layout" :class="{ 'nav-open': open }">
    <aside class="sidebar">
      <RouterLink to="/" class="brand">
        <img :src="logo" alt="SchoolDoc logo" />
        <span>School<b>Doc</b></span>
      </RouterLink>
      <nav>
        <div v-for="g in visibleNav" :key="g.group" class="nav-group">
          <p class="nav-title">{{ g.group }}</p>
          <!-- exact match for "/" and "/finances", so they aren't highlighted on their sub-pages -->
          <RouterLink v-for="i in g.items" :key="i.to" :to="i.to" class="nav-link"
                      :exact-active-class="i.exact ? 'active' : ''"
                      :active-class="i.exact ? '' : 'active'">
            <AppIcon :name="i.icon" />{{ i.label }}
          </RouterLink>
        </div>
      </nav>
      <div class="sidebar-foot">
        <p>Academic year {{ academicYear }}</p>
        <div v-if="user" class="user-box">
          <Avatar :name="user.full_name" :size="32" />
          <div class="user-meta">
            <p class="user-name">{{ user.full_name }}</p>
            <p class="user-role">{{ user.role_label }}</p>
          </div>
        </div>
        <div v-if="user" class="user-actions">
          <RouterLink to="/change-password" title="Change password"><AppIcon name="key" size="16" />Password</RouterLink>
          <button type="button" @click="signOut"><AppIcon name="logout" size="16" />Sign out</button>
        </div>
      </div>
    </aside>
    <div class="backdrop" @click="open = false" />

    <div class="main">
      <header class="topbar">
        <button class="icon-btn menu-btn" aria-label="Open menu" @click="open = true"><AppIcon name="menu" /></button>
        <RouterLink to="/" class="brand mobile-brand"><img :src="logo" alt="" /><span>School<b>Doc</b></span></RouterLink>
      </header>
      <main class="content">
        <RouterView v-slot="{ Component }">
          <Transition name="fade" mode="out-in"><component :is="Component" :key="route.fullPath" /></Transition>
        </RouterView>
      </main>
      <footer class="app-footer">© {{ now.getFullYear() }} Bytes-Corp. All rights reserved.</footer>
    </div>
  </div>
</template>
