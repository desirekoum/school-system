import { Router } from 'express';
import { query, pool } from '../../db/pool.js';
import { HttpError } from '../../middleware/errors.js';
import { paginatedList } from '../../db/paginate.js';
import { hashPassword, temporaryPassword } from '../auth/crypto.js';
import { logEvent } from '../auth/auth.service.js';
import { ROLES, PERMISSIONS } from '../auth/roles.js';

const router = Router();
const MFA_METHODS = ['totp', 'email', 'sms'];

// Never select password_hash or totp_secret into an API response
const USERS = {
  baseSql: `
    SELECT u.id, u.username, u.full_name, u.email, u.phone, u.role, u.teacher_id, u.mfa_method, u.totp_confirmed,
           u.is_active, u.must_change_password, u.failed_attempts, u.last_login_at, u.password_changed_at, u.created_at,
           (u.locked_until > now()) IS TRUE AS locked, u.locked_until,
           t.first_name || ' ' || t.last_name AS teacher
    FROM users u LEFT JOIN teachers t ON t.id = u.teacher_id`,
  orderBy: 'role, full_name',
  searchColumns: ['username', 'full_name', 'email', 'phone'],
  filters: ['role', 'is_active'],
};

async function getUser(id) {
  const { rows: [u] } = await query(`SELECT * FROM (${USERS.baseSql}) t WHERE id = $1`, [id]);
  if (!u) throw new HttpError(404, 'User not found');
  return u;
}

function validate(body, { creating }) {
  const data = {};
  if (creating || body.username !== undefined) {
    data.username = String(body.username ?? '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(data.username)) throw new HttpError(400, 'Username: 3 to 40 characters among a-z, 0-9, . _ -');
  }
  for (const f of ['full_name', 'email', 'phone']) {
    if (body[f] !== undefined) data[f] = String(body[f] ?? '').trim() || null;
  }
  if (creating && !data.full_name) throw new HttpError(400, 'Missing: full_name');
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new HttpError(400, 'Invalid email address');
  if (data.phone && !/^\+?[\d\s-]{8,20}$/.test(data.phone)) throw new HttpError(400, 'Phone: international format, e.g. +237 6 99 12 34 56');
  if (data.phone) data.phone = data.phone.replace(/[\s-]/g, '');
  if (creating || body.role !== undefined) {
    if (!ROLES[body.role]) throw new HttpError(400, `role must be one of ${Object.keys(ROLES).join(', ')}`);
    data.role = body.role;
  }
  if (body.teacher_id !== undefined) data.teacher_id = body.teacher_id || null;
  if (body.mfa_method !== undefined || creating) {
    data.mfa_method = body.mfa_method ?? 'email';
    if (!MFA_METHODS.includes(data.mfa_method)) throw new HttpError(400, `mfa_method must be one of ${MFA_METHODS.join(', ')}`);
  }
  if (body.is_active !== undefined) data.is_active = !!body.is_active;
  return data;
}

// The system must always keep at least one active administrator
async function assertKeepsAnAdmin(id, next) {
  const { rows: [cur] } = await query('SELECT role, is_active FROM users WHERE id = $1', [id]);
  if (!cur || cur.role !== 'admin' || !cur.is_active) return;
  if ((next.role ?? 'admin') === 'admin' && next.is_active !== false) return;
  const { rows: [{ n }] } = await query("SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND is_active AND id <> $1", [id]);
  if (!n) throw new HttpError(409, 'This is the last active administrator: create another one first');
}

const actor = (req) => ({ ip: req.ip, detail: `by ${req.user.username}` });

// ---------- Roles reference (for the permissions matrix) ----------
router.get('/roles', (req, res) => res.json({ roles: ROLES, permissions: PERMISSIONS }));

// ---------- Security log ----------
router.get('/events', async (req, res) => res.json(await paginatedList(req.query, {
  baseSql: 'SELECT * FROM auth_events', orderBy: 'created_at DESC', searchColumns: ['username', 'event', 'detail', 'ip'], filters: ['event', 'user_id'],
})));

// ---------- Users ----------
router.get('/', async (req, res) => res.json(await paginatedList(req.query, USERS)));

router.get('/:id', async (req, res) => {
  const user = await getUser(req.params.id);
  const [{ rows: events }, { rows: [sessions] }] = await Promise.all([
    query('SELECT * FROM auth_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 15', [req.params.id]),
    query('SELECT count(*)::int AS active FROM sessions WHERE user_id = $1 AND expires_at > now()', [req.params.id]),
  ]);
  res.json({ ...user, events, active_sessions: sessions.active });
});

/** Creates the account with a temporary password, shown once; the user must change it at first sign-in. */
router.post('/', async (req, res) => {
  const data = validate(req.body, { creating: true });
  const password = temporaryPassword();
  data.password_hash = await hashPassword(password);
  const cols = Object.keys(data);
  const { rows: [u] } = await query(
    `INSERT INTO users (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`, Object.values(data));
  await logEvent({ user_id: u.id, username: data.username, event: 'user_created', ...actor(req) });
  res.status(201).json({ user: await getUser(u.id), temporary_password: password });
});

router.put('/:id', async (req, res) => {
  const data = validate(req.body, { creating: false });
  delete data.username;   // the username is the stable sign-in identifier
  if (!Object.keys(data).length) throw new HttpError(400, 'No fields to update');
  const self = Number(req.params.id) === req.user.id;
  if (self && (data.is_active === false || (data.role && data.role !== req.user.role))) {
    throw new HttpError(409, 'You cannot deactivate yourself or change your own role');
  }
  await assertKeepsAnAdmin(req.params.id, data);

  const before = await getUser(req.params.id);
  const cols = Object.keys(data);
  // Leaving the authenticator method forgets its secret: switching back means scanning a new QR code
  const resetTotp = data.mfa_method && data.mfa_method !== 'totp' ? ', totp_secret = NULL, totp_confirmed = false' : '';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE users SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(',')}${resetTotp} WHERE id = $${cols.length + 1}`,
      [...Object.values(data), req.params.id]);
    // Deactivation or a new role takes effect now: the user's open sessions end
    if (data.is_active === false || (data.role && data.role !== before.role)) {
      await client.query('DELETE FROM sessions WHERE user_id = $1', [req.params.id]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  const changes = cols.filter((c) => String(before[c] ?? '') !== String(data[c] ?? '')).join(', ');
  await logEvent({ user_id: before.id, username: before.username, event: 'user_updated', ...actor(req), detail: `${changes || 'no change'} by ${req.user.username}` });
  res.json(await getUser(req.params.id));
});

router.post('/:id/reset-password', async (req, res) => {
  const user = await getUser(req.params.id);
  const password = temporaryPassword();
  await query('UPDATE users SET password_hash = $2, must_change_password = true, password_changed_at = now() WHERE id = $1',
    [user.id, await hashPassword(password)]);
  await query('DELETE FROM sessions WHERE user_id = $1', [user.id]);
  await logEvent({ user_id: user.id, username: user.username, event: 'password_reset', ...actor(req) });
  res.json({ temporary_password: password });
});

// Lost phone: the next sign-in shows a new QR code to scan
router.post('/:id/reset-mfa', async (req, res) => {
  const user = await getUser(req.params.id);
  await query('UPDATE users SET totp_secret = NULL, totp_confirmed = false, totp_last_step = NULL WHERE id = $1', [user.id]);
  await logEvent({ user_id: user.id, username: user.username, event: 'mfa_reset', ...actor(req) });
  res.json(await getUser(user.id));
});

router.post('/:id/unlock', async (req, res) => {
  const user = await getUser(req.params.id);
  await query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);
  await logEvent({ user_id: user.id, username: user.username, event: 'unlocked', ...actor(req) });
  res.json(await getUser(user.id));
});

router.post('/:id/sign-out', async (req, res) => {
  const user = await getUser(req.params.id);
  const { rowCount } = await query('DELETE FROM sessions WHERE user_id = $1', [user.id]);
  await logEvent({ user_id: user.id, username: user.username, event: 'signed_out', ...actor(req), detail: `${rowCount} session(s) by ${req.user.username}` });
  res.json({ ended: rowCount });
});

router.delete('/:id', async (req, res) => {
  if (Number(req.params.id) === req.user.id) throw new HttpError(409, 'You cannot delete your own account');
  await assertKeepsAnAdmin(req.params.id, { is_active: false });
  const user = await getUser(req.params.id);
  await query('DELETE FROM users WHERE id = $1', [user.id]);
  await logEvent({ username: user.username, event: 'user_deleted', ...actor(req) });
  res.status(204).end();
});

export default router;
