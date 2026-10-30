import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from '../composables/useAuth';

const ATTENDANCE = ['attendance:take', 'attendance:read', 'attendance:manage'];

// Lazy-loaded routes: each view is split into its own JS chunk.
// meta.perm: permission needed to open the page (the API checks it again on every call).
const routes = [
  { path: '/login', component: () => import('../views/LoginView.vue'), meta: { public: true } },
  { path: '/change-password', component: () => import('../views/ChangePasswordView.vue'), meta: { bare: true } },
  { path: '/', component: () => import('../views/DashboardView.vue') },
  { path: '/students', component: () => import('../views/StudentsView.vue'), meta: { perm: 'students:read' } },
  { path: '/students/:id', component: () => import('../views/StudentDetailView.vue'), props: true, meta: { perm: 'students:read' } },
  { path: '/registrations', component: () => import('../views/RegistrationsView.vue'), meta: { perm: 'registrations:read' } },
  { path: '/teachers', component: () => import('../views/TeachersView.vue'), meta: { perm: 'staff:read' } },
  { path: '/classes', component: () => import('../views/ClassesView.vue'), meta: { perm: 'academics:read' } },
  { path: '/classes/:id', component: () => import('../views/ClassDetailView.vue'), props: true, meta: { perm: 'academics:read' } },
  { path: '/academic-years', component: () => import('../views/AcademicYearsView.vue'), meta: { perm: 'academics:read' } },
  { path: '/finances', component: () => import('../views/FinanceAccountsView.vue'), meta: { perm: 'finance:read' } },
  { path: '/finances/payments', component: () => import('../views/PaymentsView.vue'), meta: { perm: 'finance:read' } },
  { path: '/finances/sales', component: () => import('../views/SalesView.vue'), meta: { perm: 'sales:read' } },
  { path: '/finances/sales/:id/receipt', component: () => import('../views/SaleReceiptView.vue'), props: true, meta: { perm: 'sales:read' } },
  { path: '/finances/items', component: () => import('../views/ItemsView.vue'), meta: { perm: 'items:read' } },
  { path: '/finances/expenses', component: () => import('../views/ExpensesView.vue'), meta: { perm: 'expenses:read' } },
  { path: '/finances/reports', component: () => import('../views/FinanceReportView.vue'), meta: { perm: 'reports:read' } },
  { path: '/finances/receipts/:id', component: () => import('../views/ReceiptView.vue'), props: true, meta: { perm: 'finance:read' } },
  { path: '/timetable', component: () => import('../views/TimetableView.vue'), meta: { perm: 'academics:read' } },
  { path: '/attendance', component: () => import('../views/AttendanceView.vue'), meta: { perm: ATTENDANCE } },
  { path: '/attendance/reports', component: () => import('../views/AttendanceReportView.vue'), meta: { perm: ['attendance:read', 'attendance:take'] } },
  { path: '/attendance/:slotId/:date', component: () => import('../views/AttendanceSheetView.vue'), props: true, meta: { perm: ATTENDANCE } },
  { path: '/courses', component: () => import('../views/CoursesView.vue'), meta: { perm: 'academics:read' } },
  { path: '/users', component: () => import('../views/UsersView.vue'), meta: { perm: 'users:manage' } },
  { path: '/forbidden', component: () => import('../views/ForbiddenView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

// Only an in-app path is accepted as "next" ("//evil.com" would leave the site: open redirect)
const safeNext = (next) => (typeof next === 'string' && /^\/(?!\/)/.test(next) ? next : '/');

const router = createRouter({ history: createWebHistory(), routes });

// Navigation guard: signed in? password changed? allowed by the role?
router.beforeEach(async (to) => {
  const { user, fetchMe, can } = useAuth();
  await fetchMe();
  if (to.meta.public) return user.value ? safeNext(to.query.next) : true;
  if (!user.value) return { path: '/login', query: to.fullPath !== '/' ? { next: to.fullPath } : {} };
  if (user.value.must_change_password && to.path !== '/change-password') return '/change-password';
  if (to.meta.perm && !can(to.meta.perm)) return { path: '/forbidden', query: { from: to.fullPath } };
  return true;
});

export default router;
