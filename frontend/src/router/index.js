import { createRouter, createWebHistory } from 'vue-router';

// Lazy-loaded routes: each view is split into its own JS chunk
const routes = [
  { path: '/', redirect: '/students' },
  { path: '/students', component: () => import('../views/StudentsView.vue') },
  { path: '/registrations', component: () => import('../views/RegistrationsView.vue') },
  { path: '/teachers', component: () => import('../views/TeachersView.vue') },
  { path: '/classes', component: () => import('../views/ClassesView.vue') },
  { path: '/classes/:id', component: () => import('../views/ClassDetailView.vue'), props: true },
  { path: '/courses', component: () => import('../views/CoursesView.vue') },
];

export default createRouter({ history: createWebHistory(), routes });
