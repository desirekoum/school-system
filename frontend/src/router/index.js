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
  { path: '/finances', component: () => import('../views/FinanceAccountsView.vue') },
  { path: '/finances/payments', component: () => import('../views/PaymentsView.vue') },
  { path: '/finances/sales', component: () => import('../views/SalesView.vue') },
  { path: '/finances/sales/:id/receipt', component: () => import('../views/SaleReceiptView.vue'), props: true },
  { path: '/finances/items', component: () => import('../views/ItemsView.vue') },
  { path: '/finances/expenses', component: () => import('../views/ExpensesView.vue') },
  { path: '/finances/reports', component: () => import('../views/FinanceReportView.vue') },
  { path: '/finances/receipts/:id', component: () => import('../views/ReceiptView.vue'), props: true },
  { path: '/courses', component: () => import('../views/CoursesView.vue') },
];

export default createRouter({ history: createWebHistory(), routes });
