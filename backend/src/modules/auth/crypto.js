import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

// One application secret derives the keys for encryption (TOTP secrets) and code hashing
const APP_SECRET = process.env.APP_SECRET ?? (() => {
  if (process.env.NODE_ENV === 'production') throw new Error('APP_SECRET must be set in production');
  console.warn('[auth] APP_SECRET is not set: using an insecure development secret');
  return 'dev-only-insecure-secret';
})();
const ENC_KEY = crypto.createHash('sha256').update(`enc:${APP_SECRET}`).digest();
const MAC_KEY = crypto.createHash('sha256').update(`mac:${APP_SECRET}`).digest();

// ---------- Passwords: scrypt (memory-hard, slows down brute force on stolen hashes) ----------
const SCRYPT = { N: 16384, r: 8, p: 1 };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [algo, N, r, p, salt, hash] = String(stored).split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  // Constant-time comparison: the response time doesn't reveal how many bytes matched
  return crypto.timingSafeEqual(actual, expected);
}

// Same cost as a real check, so an unknown username answers as slowly as a wrong password
const DUMMY_HASH = await hashPassword(crypto.randomBytes(16).toString('hex'));
export const fakePasswordCheck = (password) => verifyPassword(String(password), DUMMY_HASH).then(() => false);

export function checkPasswordPolicy(password) {
  if (typeof password !== 'string' || password.length < 10) return 'Password must be at least 10 characters';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Password must contain letters and digits';
  return null;
}

// Readable temporary password, e.g. "Kp7m-x2Qd-9fTw"
export function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const part = () => Array.from({ length: 4 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  let pwd;
  do pwd = `${part()}-${part()}-${part()}`; while (checkPasswordPolicy(pwd));
  return pwd;
}

// ---------- Tokens and one-time codes ----------
export const randomToken = () => crypto.randomBytes(32).toString('base64url');
// Only the hash is stored: a leaked database doesn't give working session tokens
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const randomCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
// Keyed hash (HMAC): a 6-digit code can't be brute-forced offline without APP_SECRET
export const hashCode = (code) => crypto.createHmac('sha256', MAC_KEY).update(String(code)).digest('hex');
export const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// ---------- Encryption at rest: AES-256-GCM (confidentiality + integrity) ----------
export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(stored) {
  const [iv, tag, data] = stored.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

// ---------- TOTP (RFC 6238), compatible with Google Authenticator, Microsoft Authenticator, Authy ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = '';
  for (const byte of buf) bits += byte.toString(2).padStart(8, '0');
  return bits.match(/.{1,5}/g).map((chunk) => B32[parseInt(chunk.padEnd(5, '0'), 2)]).join('');
}

function base32Decode(str) {
  const bits = str.replace(/=+$/, '').toUpperCase().split('').map((c) => B32.indexOf(c).toString(2).padStart(5, '0')).join('');
  return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
}

export const newTotpSecret = () => base32Encode(crypto.randomBytes(20));

// HOTP: HMAC-SHA1 of the counter, then "dynamic truncation" to 6 digits
function hotp(secret, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

const STEP = 30;
export const totpNow = (secret) => hotp(secret, Math.floor(Date.now() / 1000 / STEP));

/** Returns the matched time step (to block replays), or null. Accepts ±1 step for clock drift. */
export function verifyTotp(secret, code, lastStep = null) {
  const now = Math.floor(Date.now() / 1000 / STEP);
  for (const step of [now - 1, now, now + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    if (safeEqual(hotp(secret, step), String(code))) return step;
  }
  return null;
}

export const otpauthUrl = (secret, username, issuer) =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${username}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=${STEP}`;
