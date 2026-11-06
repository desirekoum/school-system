import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import students from './modules/students/students.routes.js';
import teachers from './modules/teachers/teachers.routes.js';
import classes from './modules/classes/classes.routes.js';
import courses from './modules/courses/courses.routes.js';
import registrations from './modules/registrations/registrations.routes.js';
import guardians from './modules/guardians/guardians.routes.js';
import academicYears from './modules/academic-years/academic-years.routes.js';
import finances from './modules/finances/finances.routes.js';
import { items, sales, expenses } from './modules/store/store.routes.js';
import auth from './modules/auth/auth.routes.js';
import users from './modules/users/users.routes.js';
import imports from './modules/import/import.routes.js';
import timetable from './modules/timetable/timetable.routes.js';
import attendance from './modules/attendance/attendance.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import { errorHandler } from './middleware/errors.js';
import { loadUser, requireAuth, authorize, checkOrigin, requireHttps } from './middleware/auth.js';

export const app = express();

const origins = (process.env.CORS_ORIGIN ?? 'https://localhost:5173').split(',').map((o) => o.trim());

// Behind a reverse proxy (Caddy, nginx), trust its X-Forwarded-* headers for req.ip and req.secure
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);
app.disable('x-powered-by');
// Security headers: HSTS (browsers stay on HTTPS), no MIME sniffing, no framing (clickjacking)...
app.use(helmet({ hsts: { maxAge: 31536000, includeSubDomains: true } }));
app.use(requireHttps);
// credentials: true lets the browser send the session cookie to an allowed origin
app.use(cors({ origin: origins, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api', checkOrigin(origins));
// No caching of API answers (personal and financial data) by the browser or a proxy
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api', loadUser);
app.use('/api/auth', auth);
// Everything below needs a signed-in user whose role has the permission (see the ACCESS table)
app.use('/api', requireAuth, authorize);
app.use('/api/users', users);
app.use('/api/students', students);
app.use('/api/teachers', teachers);
app.use('/api/classes', classes);
app.use('/api/courses', courses);
app.use('/api/registrations', registrations);
app.use('/api/guardians', guardians);
app.use('/api/academic-years', academicYears);
app.use('/api/finances', finances);
app.use('/api/items', items);
app.use('/api/sales', sales);
app.use('/api/expenses', expenses);
app.use('/api/import', imports);
app.use('/api/timetable', timetable);
app.use('/api/attendance', attendance);
app.use('/api/dashboard', dashboardRoutes);

// Single-process deployment (shared hosting such as Hostinger's Node.js apps): the API also serves the built
// Vue app from frontend/dist. Off by default: in development Vite serves the frontend, and on a VPS Caddy/nginx does.
if (process.env.SERVE_FRONTEND === 'true') {
  const dist = process.env.FRONTEND_DIST ?? fileURLToPath(new URL('../../frontend/dist', import.meta.url));
  // Hashed file names (assets/index-3f2a.js) never change content: cache them for a year
  app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(dist, { index: false }));
  // SPA fallback: /classes/3/promotion is a Vue Router page, not a file
  app.get(/^\/(?!api(\/|$)).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
// Express 5 forwards rejected async handlers here automatically
app.use(errorHandler);
