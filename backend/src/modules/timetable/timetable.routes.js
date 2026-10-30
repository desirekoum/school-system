import { Router } from 'express';
import { listSlots, slotsAt, createSlot, updateSlot, deleteSlot } from './timetable.service.js';

// Weekly timetable of a class (classes are per academic year). Read: academics:read · write: academics:write
const router = Router();

// ?class_id= → that class's week · ?teacher_id=&academic_year= → a teacher's week · ?mine=1 → the signed-in teacher's week
router.get('/', async (req, res) => {
  const teacher_id = req.query.mine ? req.user.teacher_id : req.query.teacher_id;
  if (req.query.mine && !teacher_id) return res.json([]);
  res.json(await listSlots({ ...req.query, teacher_id }));
});

// What is being taught now (or ?at=2026-10-30T09:15), optionally ?class_id= or ?teacher_id=
router.get('/now', async (req, res) => res.json(await slotsAt(req.query)));

router.post('/', async (req, res) => res.status(201).json(await createSlot(req.body)));
router.put('/:id', async (req, res) => res.json(await updateSlot(req.params.id, req.body)));
router.delete('/:id', async (req, res) => { await deleteSlot(req.params.id); res.status(204).end(); });

export default router;
