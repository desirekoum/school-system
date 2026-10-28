import { createRouter, createWebHistory } from 'vue-router';

// Lazy-loaded routes: each view is split into its own JS chunk
const routes = [
  { path: '/', component: () => import('../views/DashboardView.vue') },
  { path: '/students', component: () => import('../views/StudentsView.vue') },
  { path: '/students/:id', component: () => import('../views/StudentDetailView.vue'), props: true },
  { path: '/registrations', component: () => import('../views/RegistrationsView.vue') },
  { path: '/teachers', component: () => import('../views/TeachersView.vue') },
  { path: '/classes', component: () => import('../views/ClassesView.vue') },
  { path: '/classes/:id', component: () => import('../views/ClassDetailView.vue'), props: true },
  { path: '/academic-years', component: () => import('../views/AcademicYearsView.vue') },
  { path: '/courses', component: () => import('../views/CoursesView.vue') },
];

export default createRouter({ history: createWebHistory(), routes });
