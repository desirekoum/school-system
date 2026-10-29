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

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
// Express 5 forwards rejected async handlers here automatically
app.use(errorHandler);
