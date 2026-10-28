<script setup>
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppIcon from './components/AppIcon.vue';
import logo from './assets/logo.png';

const nav = [
  { group: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: 'dashboard', exact: true }] },
  { group: 'People', items: [
    { to: '/students', label: 'Students', icon: 'students' },
    { to: '/teachers', label: 'Teachers', icon: 'teachers' },
  ] },
  { group: 'Academics', items: [
    { to: '/academic-years', label: 'Academic years', icon: 'calendar' },
    { to: '/registrations', label: 'Registrations', icon: 'registrations' },
    { to: '/classes', label: 'Classes', icon: 'classes' },
    { to: '/courses', label: 'Courses', icon: 'courses' },
  ] },
  { group: 'Finances', items: [
    { to: '/finances', label: 'Tuition & accounts', icon: 'wallet', exact: true },
    { to: '/finances/payments', label: 'Tuition payments', icon: 'receipt' },
    { to: '/finances/sales', label: 'Sales', icon: 'cart' },
    { to: '/finances/items', label: 'Items for sale', icon: 'tag' },
    { to: '/finances/expenses', label: 'Expenses', icon: 'expense' },
    { to: '/finances/reports', label: 'Financial reports', icon: 'chart' },
  ] },
];

// School year starts in September (month index 8)
const now = new Date();
const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
const academicYear = `${startYear}–${startYear + 1}`;

// Mobile: sidebar is an off-canvas drawer, closed on every navigation
const open = ref(false);
const route = useRoute();
watch(() => route.fullPath, () => (open.value = false));
</script>

<template>
  <div class="layout" :class="{ 'nav-open': open }">
    <aside class="sidebar">
      <RouterLink to="/" class="brand">
        <img :src="logo" alt="SchoolDoc logo" />
        <span>School<b>Doc</b></span>
      </RouterLink>
      <nav>
        <div v-for="g in nav" :key="g.group" class="nav-group">
          <p class="nav-title">{{ g.group }}</p>
          <!-- exact match for "/" and "/finances", so they aren't highlighted on their sub-pages -->
          <RouterLink v-for="i in g.items" :key="i.to" :to="i.to" class="nav-link"
                      :exact-active-class="i.exact ? 'active' : ''"
                      :active-class="i.exact ? '' : 'active'">
            <AppIcon :name="i.icon" />{{ i.label }}
          </RouterLink>
        </div>
      </nav>
      <p class="sidebar-foot">Academic year {{ academicYear }}</p>
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
