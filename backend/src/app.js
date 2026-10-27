import express from 'express';
import cors from 'cors';
import students from './modules/students/students.routes.js';
import teachers from './modules/teachers/teachers.routes.js';
import classes from './modules/classes/classes.routes.js';
import courses from './modules/courses/courses.routes.js';
import registrations from './modules/registrations/registrations.routes.js';
import { errorHandler } from './middleware/errors.js';

export const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/students', students);
app.use('/api/teachers', teachers);
app.use('/api/classes', classes);
app.use('/api/courses', courses);
app.use('/api/registrations', registrations);

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
// Express 5 forwards rejected async handlers here automatically
app.use(errorHandler);
