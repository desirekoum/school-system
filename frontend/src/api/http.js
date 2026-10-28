import axios from 'axios';

export const http = axios.create({ baseURL: '/api' });

// Normalize backend errors to a single readable message
http.interceptors.response.use(
  (res) => res,
  (err) => Promise.reject(new Error(err.response?.data?.error ?? err.message)),
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
