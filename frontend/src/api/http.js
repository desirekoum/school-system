import axios from 'axios';

export const http = axios.create({ baseURL: '/api' });

// Normalize backend errors to a single readable message
http.interceptors.response.use(
  (res) => res,
  (err) => Promise.reject(new Error(err.response?.data?.error ?? err.message)),
);

/** Factory returning CRUD calls for a REST resource, e.g. resource('students') */
export const resource = (name) => ({
  list: () => http.get(`/${name}`).then((r) => r.data),
  get: (id) => http.get(`/${name}/${id}`).then((r) => r.data),
  create: (data) => http.post(`/${name}`, data).then((r) => r.data),
  update: (id, data) => http.put(`/${name}/${id}`, data).then((r) => r.data),
  remove: (id) => http.delete(`/${name}/${id}`),
});

export const studentsApi = resource('students');
export const teachersApi = resource('teachers');
export const coursesApi = resource('courses');
export const classesApi = {
  ...resource('classes'),
  courses: (id) => http.get(`/classes/${id}/courses`).then((r) => r.data),
  assignCourse: (id, data) => http.post(`/classes/${id}/courses`, data).then((r) => r.data),
  unassignCourse: (id, courseId) => http.delete(`/classes/${id}/courses/${courseId}`),
  students: (id) => http.get(`/classes/${id}/students`).then((r) => r.data),
};
export const registrationsApi = {
  list: () => http.get('/registrations').then((r) => r.data),
  create: (data) => http.post('/registrations', data).then((r) => r.data),
  setStatus: (id, status) => http.patch(`/registrations/${id}/status`, { status }).then((r) => r.data),
  remove: (id) => http.delete(`/registrations/${id}`),
};
