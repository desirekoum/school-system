import QRCode from 'qrcode';
import { query, pool } from '../../db/pool.js';
import { HttpError } from '../../middleware/errors.js';
import {
  verifyPassword, fakePasswordCheck, hashPassword, checkPasswordPolicy, randomToken, sha256, randomCode, hashCode,
  safeEqual, encrypt, decrypt, newTotpSecret, verifyTotp, otpauthUrl,
} from './crypto.js';
import { sendEmail, sendSms, maskEmail, maskPhone } from './notify.js';
import { ROLES, permissionsOf } from './roles.js';

const env = process.env;
export const APP_NAME = env.APP_NAME ?? 'SchoolDoc';
const IDLE_MINUTES = Number(env.SESSION_IDLE_MINUTES ?? 30);
const MAX_HOURS = Number(env.SESSION_MAX_HOURS ?? 12);
const LOCK_AFTER = 5;          // failed passwords or codes in a row
const LOCK_MINUTES = 15;
const CODE_MINUTES = 5;
const CODE_ATTEMPTS = 5;
const RESEND_SECONDS = 30;

export const SESSION_COOKIE = 'sd_session';
// httpOnly: JavaScript can't read it (XSS can't steal it). Secure: only sent over HTTPS.
// SameSite=Strict: never sent by requests started from another site (CSRF).
export const cookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE !== 'false',
  sameSite: 'strict',
  path: '/api',
  maxAge: MAX_HOURS * 3600 * 1000,
};

export async function logEvent({ user_id = null, username = null, event, detail = null, ip = null }) {
  await query('INSERT INTO auth_events (user_id, username, event, detail, ip) VALUES ($1, $2, $3, $4, $5)',
    [user_id, username, event, detail, ip]);
}

/** The user as the frontend sees it: no hashes, no secrets, with the role's permissions. */
export const publicUser = (u) => ({
  id: u.id, username: u.username, full_name: u.full_name, email: u.email, phone: u.phone,
  role: u.role, role_label: ROLES[u.role]?.label, teacher_id: u.teacher_id, mfa_method: u.mfa_method,
  must_change_password: u.must_change_password, permissions: permissionsOf(u.role),
});

const invalid = () => new HttpError(401, 'Invalid username or password');

// A failed password or code counts toward the lockout; the counter resets only after a full sign-in
async function registerFailure(user, ip, event) {
  const { rows: [u] } = await query(`
    UPDATE users SET failed_attempts = failed_attempts + 1,
      locked_until = CASE WHEN failed_attempts + 1 >= $2 THEN now() + make_interval(mins => $3) END
    WHERE id = $1 RETURNING failed_attempts, locked_until`, [user.id, LOCK_AFTER, LOCK_MINUTES]);
  await logEvent({ user_id: user.id, username: user.username, event, ip });
  if (u.locked_until) {
    await query('UPDATE users SET failed_attempts = 0 WHERE id = $1', [user.id]);
    await query('DELETE FROM auth_challenges WHERE user_id = $1', [user.id]);
    await logEvent({ user_id: user.id, username: user.username, event: 'locked', detail: `${LOCK_AFTER} failures`, ip });
    throw new HttpError(423, `Too many failed attempts: account locked for ${LOCK_MINUTES} minutes`);
  }
}

function assertNotLocked(user) {
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutes = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
    throw new HttpError(423, `Account locked after too many failed attempts. Try again in ${minutes} min.`);
  }
}

async function sendCode(user, method, code) {
  const text = `${APP_NAME}: your sign-in code is ${code}. It expires in ${CODE_MINUTES} minutes. Never share it.`;
  if (method === 'email') await sendEmail(user.email, `${APP_NAME} sign-in code`, text);
  else await sendSms(user.phone, text);
}

const destination = (user, method) =>
  method === 'email' ? maskEmail(user.email) : method === 'sms' ? maskPhone(user.phone) : 'authenticator app';

// ---------- Step 1: username + password → a challenge waiting for the second factor ----------
export async function login({ username, password }, ip) {
  if (!username || !password) throw new HttpError(400, 'Username and password are required');
  const name = String(username).trim().toLowerCase();
  const { rows: [user] } = await query('SELECT * FROM users WHERE username = $1', [name]);
  if (!user) {
    await fakePasswordCheck(password);
    await logEvent({ username: name, event: 'login_failed', detail: 'unknown user', ip });
    throw invalid();
  }
  assertNotLocked(user);
  if (!(await verifyPassword(String(password), user.password_hash))) {
    await registerFailure(user, ip, 'login_failed');
    throw invalid();
  }
  if (!user.is_active) {
    await logEvent({ user_id: user.id, username: name, event: 'login_failed', detail: 'inactive', ip });
    throw invalid();
  }

  const method = user.mfa_method;
  const setup = method === 'totp' && !user.totp_confirmed;
  const token = randomToken();
  const code = method === 'totp' ? null : randomCode();
  const secret = setup ? newTotpSecret() : null;
  await query('DELETE FROM auth_challenges WHERE user_id = $1', [user.id]);
  await query(`
    INSERT INTO auth_challenges (user_id, token_hash, purpose, method, code_hash, pending_secret, sent_at, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, now(), now() + make_interval(mins => $7))`,
    [user.id, sha256(token), setup ? 'totp_setup' : 'login', method, code && hashCode(code),
      secret && encrypt(secret), setup ? 10 : CODE_MINUTES]);
  if (code) await sendCode(user, method, code);

  const result = { challenge: token, method, destination: destination(user, method) };
  if (setup) {
    const url = otpauthUrl(secret, user.username, APP_NAME);
    result.setup = { secret, otpauth_url: url, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) };
  }
  return result;
}

async function findChallenge(token) {
  const { rows: [c] } = await query(`
    SELECT ch.*, u.username, u.email, u.phone, u.totp_secret, u.totp_last_step, u.locked_until, u.is_active
    FROM auth_challenges ch JOIN users u ON u.id = ch.user_id
    WHERE ch.token_hash = $1 AND ch.expires_at > now()`, [sha256(String(token ?? ''))]);
  if (!c || !c.is_active) throw new HttpError(401, 'This code has expired: sign in again');
  assertNotLocked(c);
  return c;
}

// ---------- Step 2: the one-time code → a session ----------
export async function verify({ challenge, code }, { ip, userAgent }) {
  const c = await findChallenge(challenge);
  const clean = String(code ?? '').replace(/\s/g, '');
  let step = null;
  let ok = false;
  if (/^\d{6}$/.test(clean)) {
    if (c.method === 'totp') {
      const secret = decrypt(c.purpose === 'totp_setup' ? c.pending_secret : c.totp_secret);
      step = verifyTotp(secret, clean, c.totp_last_step === null ? null : Number(c.totp_last_step));
      ok = step !== null;
    } else {
      ok = safeEqual(hashCode(clean), c.code_hash);
    }
  }
  if (!ok) {
    const user = { id: c.user_id, username: c.username };
    await registerFailure(user, ip, 'code_failed');
    const { rows: [left] } = await query(
      'UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = $1 RETURNING $2 - attempts AS remaining', [c.id, CODE_ATTEMPTS]);
    if (left.remaining <= 0) {
      await query('DELETE FROM auth_challenges WHERE id = $1', [c.id]);
      throw new HttpError(401, 'Too many wrong codes: sign in again');
    }
    throw new HttpError(401, `Invalid code (${left.remaining} attempt${left.remaining > 1 ? 's' : ''} left)`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Deleting the challenge in the transaction makes the code single-use, even if two requests race
    const { rowCount } = await client.query('DELETE FROM auth_challenges WHERE id = $1', [c.id]);
    if (!rowCount) throw new HttpError(401, 'This code has already been used: sign in again');
    const { rows: [user] } = await client.query(`
      UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = now(),
        totp_last_step = COALESCE($2, totp_last_step),
        totp_secret = CASE WHEN $3 THEN $4 ELSE totp_secret END,
        totp_confirmed = totp_confirmed OR $3
      WHERE id = $1 RETURNING *`, [c.user_id, step, c.purpose === 'totp_setup', c.pending_secret]);
    const token = randomToken();
    await client.query(`
      INSERT INTO sessions (user_id, token_hash, ip, user_agent, expires_at)
      VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5))`,
      [user.id, sha256(token), ip, userAgent?.slice(0, 300) ?? null, MAX_HOURS]);
    await client.query('COMMIT');
    await logEvent({ user_id: user.id, username: user.username, event: 'login', detail: c.method, ip });
    return { token, user: publicUser(user) };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function resend({ challenge }) {
  const c = await findChallenge(challenge);
  if (c.method === 'totp') throw new HttpError(400, 'Open your authenticator app to read the current code');
  const wait = RESEND_SECONDS - Math.floor((Date.now() - new Date(c.sent_at)) / 1000);
  if (wait > 0) throw new HttpError(429, `Wait ${wait} s before asking for a new code`);
  const code = randomCode();
  // Attempts are kept: asking for a new code doesn't reset the guessing budget
  await query(`UPDATE auth_challenges SET code_hash = $2, sent_at = now(), expires_at = now() + make_interval(mins => $3)
               WHERE id = $1`, [c.id, hashCode(code), CODE_MINUTES]);
  await sendCode(c, c.method, code);
  return { destination: destination(c, c.method) };
}

// ---------- Sessions ----------
/** Sliding idle timeout + absolute expiry. Returns the user, or null. */
export async function sessionUser(token) {
  if (!token) return null;
  const { rows: [u] } = await query(`
    SELECT u.*, s.id AS session_id, s.last_seen_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > now() AND s.last_seen_at > now() - make_interval(mins => $2) AND u.is_active`,
    [sha256(token), IDLE_MINUTES]);
  if (!u) return null;
  // Touch at most once a minute: avoids a write on every request
  if (Date.now() - new Date(u.last_seen_at) > 60_000) await query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [u.session_id]);
  return u;
}

export const endSession = (token) => token && query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);

export async function changePassword(user, { current_password, new_password }, ip) {
  const { rows: [u] } = await query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
  if (!(await verifyPassword(String(current_password ?? ''), u.password_hash))) throw new HttpError(400, 'Current password is incorrect');
  const policy = checkPasswordPolicy(new_password);
  if (policy) throw new HttpError(400, policy);
  if (new_password === current_password) throw new HttpError(400, 'Choose a password different from the current one');
  await query(`UPDATE users SET password_hash = $2, must_change_password = false, password_changed_at = now() WHERE id = $1`,
    [user.id, await hashPassword(new_password)]);
  // Other devices signed in with the old password are signed out
  await query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [user.id, user.session_id]);
  await logEvent({ user_id: user.id, username: user.username, event: 'password_changed', ip });
  return publicUser({ ...user, must_change_password: false });
}
