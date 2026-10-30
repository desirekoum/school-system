import { Router } from 'express';
import { dashboard } from './dashboard.service.js';

// Every signed-in user gets a dashboard; its blocks depend on the role's permissions
const router = Router();
router.get('/', async (req, res) => res.json(await dashboard(req.user)));

export default router;
