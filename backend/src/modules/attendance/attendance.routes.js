import { Router } from 'express';
import { daySessions, getSheet, saveSheet, summary, dayRegister, studentAttendance } from './attendance.service.js';

/**
 * Attendance. The ACCESS table lets in attendance:take (teachers) and attendance:read / attendance:manage (school office);
 * the service then limits a teacher to their own slots and classes.
 */
const router = Router();

router.get('/day', async (req, res) => res.json(await daySessions(req.query, req.user)));                      // ?date&class_id
router.get('/slots/:slotId/:date', async (req, res) => res.json(await getSheet(req.params.slotId, req.params.date, req.user)));
router.put('/slots/:slotId/:date', async (req, res) => res.json(await saveSheet(req.params.slotId, req.params.date, req.body, req.user)));
router.get('/report', async (req, res) => res.json(await summary(req.query, req.user)));                       // ?group&class_id&course_id&from&to&academic_year
router.get('/register', async (req, res) => res.json(await dayRegister(req.query, req.user)));                 // ?class_id&date
router.get('/students/:id', async (req, res) => res.json(await studentAttendance(req.params.id, req.query, req.user)));

export default router;
