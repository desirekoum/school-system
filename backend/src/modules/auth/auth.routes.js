import { Router } from 'express';
import { HttpError } from '../../middleware/errors.js';
import {
  login, verify, resend, endSession, changePassword, publicUser, logEvent, SESSION_COOKIE, cookieOptions,
} from './auth.service.js';

const router = Router();

/**
 * Small in-memory rate limiter (fixed window per IP and route). Slows down password and code guessing.
 * For several API instances, move the counters to a shared store (Redis).
 */
function rateLimit({ max, windowMs }) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const n = (hits.get(key) ?? 0) + 1;
    hits.set(key, n);
    if (n > max) throw new HttpError(429, 'Too many attempts: wait a few minutes');
    next();
  };
}
const limiter = rateLimit({ max: 20, windowMs: 5 * 60 * 1000 });

router.post('/login', limiter, async (req, res) => res.json(await login(req.body, req.ip)));

router.post('/verify', limiter, async (req, res) => {
  const { token, user } = await verify(req.body, { ip: req.ip, userAgent: req.get('user-agent') });
  res.cookie(SESSION_COOKIE, token, cookieOptions);
  res.json(user);
});

router.post('/resend', limiter, async (req, res) => res.json(await resend(req.body)));

// The routes below need a session, but not a changed password (the user must be able to change it)
router.get('/me', (req, res) => {
  if (!req.user) throw new HttpError(401, 'Sign in required');
  res.json(publicUser(req.user));
});

router.post('/change-password', async (req, res) => {
  if (!req.user) throw new HttpError(401, 'Sign in required');
  res.json(await changePassword(req.user, req.body, req.ip));
});

router.post('/logout', async (req, res) => {
  await endSession(req.cookies?.[SESSION_COOKIE]);
  if (req.user) await logEvent({ user_id: req.user.id, username: req.user.username, event: 'logout', ip: req.ip });
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions, maxAge: undefined });
  res.status(204).end();
});

export default router;
