import axios from 'axios';

export const http = axios.create({ baseURL: '/api' });

/**
 * Session handling for every call: 401 (session expired) → sign-in page, keeping the page to come back to;
 * 403 PASSWORD_CHANGE_REQUIRED → change-password page. Other errors become one readable message.
 * The router is imported lazily to avoid a circular import (router → views → http).
 */
http.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status = err.response?.status;
    const url = err.config?.url ?? '';
    if (!url.startsWith('/auth/')) {
      const { default: router } = await import('../router');
      const here = router.currentRoute.value;
      if (status === 401 && !here.meta.public) router.replace({ path: '/login', query: { next: here.fullPath } });
      if (err.response?.data?.code === 'PASSWORD_CHANGE_REQUIRED') router.replace('/change-password');
    }
    const e = new Error(err.response?.data?.error ?? err.message);
    e.status = status;
    return Promise.reject(e);
  },
);

/**
 * Factory returning CRUD calls for a REST resource, e.g. resource('students').
 * list() → full array; list({ page, pageSize, search, ...filters }) → { data, total, page, pageSize, totalPages }
 */
export const resource = (name) => ({
  list: (params) => http.get(`/${name}`, { params }).then((r) => r.data),
  get: (id) => http.get(`/${name}/${id}`).then((r) => r.data),
  create: (data) => http.post(`/${name}`, data).then((r) => r.data),
  update: (id, data) => http.put(`/${name}/${id}`, data).then((r) => r.data),
  remove: (id) => http.delete(`/${name}/${id}`),
});

export const studentsApi = {
  ...resource('students'),
  guardians: (id) => http.get(`/students/${id}/guardians`).then((r) => r.data),
  addGuardian: (id, data) => http.post(`/students/${id}/guardians`, data).then((r) => r.data),
  removeGuardian: (id, guardianId) => http.delete(`/students/${id}/guardians/${guardianId}`),
  reportCard: (id, academicYear) => http.get(`/students/${id}/report-card`, { params: { academic_year: academicYear } }).then((r) => r.data),
};
export const guardiansApi = resource('guardians');
export const teachersApi = resource('teachers');
export const coursesApi = resource('courses');
export const classesApi = {
  ...resource('classes'),
  courses: (id) => http.get(`/classes/${id}/courses`).then((r) => r.data),
  assignCourse: (id, data) => http.post(`/classes/${id}/courses`, data).then((r) => r.data),
  unassignCourse: (id, courseId) => http.delete(`/classes/${id}/courses/${courseId}`),
  students: (id, params) => http.get(`/classes/${id}/students`, { params }).then((r) => r.data),
  gradebook: (id, params) => http.get(`/classes/${id}/gradebook`, { params }).then((r) => r.data),
  saveGradebook: (id, data) => http.put(`/classes/${id}/gradebook`, data).then((r) => r.data),
  results: (id, trimester) => http.get(`/classes/${id}/results`, { params: { trimester: trimester || undefined } }).then((r) => r.data),
};
export const registrationsApi = {
  list: (params) => http.get('/registrations', { params }).then((r) => r.data),
  create: (data) => http.post('/registrations', data).then((r) => r.data),
  setStatus: (id, status) => http.patch(`/registrations/${id}/status`, { status }).then((r) => r.data),
  remove: (id) => http.delete(`/registrations/${id}`),
};

export const academicYearsApi = {
  ...resource('academic-years'),
  current: () => http.get('/academic-years/current').then((r) => r.data),
  setCurrent: (id) => http.post(`/academic-years/${id}/current`).then((r) => r.data),
  updateTrimester: (id, data) => http.put(`/academic-years/trimesters/${id}`, data).then((r) => r.data),
  updateExam: (id, data) => http.put(`/academic-years/exams/${id}`, data).then((r) => r.data),
};

export const financesApi = {
  accounts: (params) => http.get('/finances/accounts', { params }).then((r) => r.data),
  account: (id) => http.get(`/finances/accounts/${id}`).then((r) => r.data),
  requestPlan: (id, data) => http.put(`/finances/accounts/${id}/plan`, data).then((r) => r.data),
  removePlan: (id) => http.delete(`/finances/accounts/${id}/plan`),
  approvePlan: (planId) => http.post(`/finances/plans/${planId}/approve`).then((r) => r.data),
  rejectPlan: (planId) => http.post(`/finances/plans/${planId}/reject`).then((r) => r.data),
  payments: (params) => http.get('/finances/payments', { params }).then((r) => r.data),
  payment: (id) => http.get(`/finances/payments/${id}`).then((r) => r.data),
  pay: (data) => http.post('/finances/payments', data).then((r) => r.data),
  voidPayment: (id, reason) => http.post(`/finances/payments/${id}/void`, { reason }).then((r) => r.data),
  report: (academicYear) => http.get('/finances/report', { params: { academic_year: academicYear } }).then((r) => r.data),
};

export const itemsApi = resource('items');
const journal = (name) => ({
  list: (params) => http.get(`/${name}`, { params }).then((r) => r.data),
  get: (id) => http.get(`/${name}/${id}`).then((r) => r.data),
  create: (data) => http.post(`/${name}`, data).then((r) => r.data),
  void: (id, reason) => http.post(`/${name}/${id}/void`, { reason }).then((r) => r.data),
});
export const salesApi = journal('sales');
export const expensesApi = journal('expenses');

export const authApi = {
  login: (data) => http.post('/auth/login', data).then((r) => r.data),
  verify: (data) => http.post('/auth/verify', data).then((r) => r.data),
  resend: (challenge) => http.post('/auth/resend', { challenge }).then((r) => r.data),
  me: () => http.get('/auth/me').then((r) => r.data),
  logout: () => http.post('/auth/logout'),
  changePassword: (data) => http.post('/auth/change-password', data).then((r) => r.data),
};

export const usersApi = {
  ...resource('users'),
  roles: () => http.get('/users/roles').then((r) => r.data),
  events: (params) => http.get('/users/events', { params }).then((r) => r.data),
  resetPassword: (id) => http.post(`/users/${id}/reset-password`).then((r) => r.data),
  resetMfa: (id) => http.post(`/users/${id}/reset-mfa`).then((r) => r.data),
  unlock: (id) => http.post(`/users/${id}/unlock`).then((r) => r.data),
  signOut: (id) => http.post(`/users/${id}/sign-out`).then((r) => r.data),
};

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// Excel imports: the file is sent as the raw request body (no multipart form needed)
export const importApi = {
  template: async (entity) => {
    const { data } = await http.get(`/import/${entity}/template`, { responseType: 'blob' });
    const { saveBlob } = await import('../utils/xlsx');
    saveBlob(data, `schooldoc-${entity}-template.xlsx`);
  },
  run: (entity, file, dryRun) =>
    http.post(`/import/${entity}`, file, { params: { dry_run: dryRun ? 1 : undefined }, headers: { 'Content-Type': XLSX_TYPE } }).then((r) => r.data),
};
