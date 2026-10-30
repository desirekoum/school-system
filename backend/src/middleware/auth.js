import { HttpError } from './errors.js';
import { sessionUser, SESSION_COOKIE } from '../modules/auth/auth.service.js';
import { can } from '../modules/auth/roles.js';

/**
 * Access table: the first rule whose method and path match decides the permission needed.
 * A request that matches no rule is refused (deny by default), except for the system administrator.
 * Paths are relative to /api. 'WRITE' = any method that changes data (POST, PUT, PATCH, DELETE).
 */
const ACCESS = [
  ['*', /^\/users(\/|$)/, 'users:manage'],

  // Excel imports (template + upload) need the right to write what is imported
  ['*', /^\/import\/(students|guardians)(\/|$)/, 'students:write'],
  ['*', /^\/import\/teachers(\/|$)/, 'staff:write'],
  ['*', /^\/import\/(courses|classes|class-courses)(\/|$)/, 'academics:write'],
  ['*', /^\/import\/items(\/|$)/, 'items:write'],
  ['*', /^\/import\/registrations(\/|$)/, 'registrations:write'],

  ['GET', /^\/students\/\d+\/report-card$/, 'grades:read'],
  ['GET', /^\/(students|guardians)(\/|$)/, 'students:read'],
  ['WRITE', /^\/(students|guardians)(\/|$)/, 'students:write'],
  ['GET', /^\/teachers(\/|$)/, 'staff:read'],
  ['WRITE', /^\/teachers(\/|$)/, 'staff:write'],

  ['GET', /^\/classes\/\d+\/(gradebook|results)$/, 'grades:read'],
  ['WRITE', /^\/classes\/\d+\/gradebook$/, 'grades:write'],
  ['GET', /^\/classes\/\d+\/students$/, 'students:read'],
  ['GET', /^\/(classes|courses|academic-years)(\/|$)/, 'academics:read'],
  ['WRITE', /^\/(classes|courses|academic-years)(\/|$)/, 'academics:write'],

  ['GET', /^\/timetable(\/|$)/, 'academics:read'],
  ['WRITE', /^\/timetable(\/|$)/, 'academics:write'],
  // Several permissions = any of them; the attendance service then narrows a teacher to their own classes
  ['GET', /^\/attendance(\/|$)/, ['attendance:read', 'attendance:take']],
  ['WRITE', /^\/attendance(\/|$)/, ['attendance:manage', 'attendance:take']],

  ['GET', /^\/registrations(\/|$)/, 'registrations:read'],
  ['WRITE', /^\/registrations(\/|$)/, 'registrations:write'],

  ['GET', /^\/finances\/report$/, 'reports:read'],
  ['GET', /^\/finances\//, 'finance:read'],
  ['POST', /^\/finances\/payments$/, 'payments:write'],
  ['POST', /^\/finances\/payments\/\d+\/void$/, 'payments:void'],
  ['WRITE', /^\/finances\/accounts\/\d+\/plan$/, 'plans:request'],
  ['POST', /^\/finances\/plans\/\d+\/(approve|reject)$/, 'plans:approve'],

  ['GET', /^\/items(\/|$)/, 'items:read'],
  ['WRITE', /^\/items(\/|$)/, 'items:write'],
  ['GET', /^\/sales(\/|$)/, 'sales:read'],
  ['POST', /^\/sales$/, 'sales:write'],
  ['POST', /^\/sales\/\d+\/void$/, 'sales:void'],
  ['GET', /^\/expenses(\/|$)/, 'expenses:read'],
  ['POST', /^\/expenses$/, 'expenses:write'],
  ['POST', /^\/expenses\/\d+\/void$/, 'expenses:void'],
];

const READS = ['GET', 'HEAD'];
const methodMatches = (rule, method) =>
  rule === '*' || rule === method || (rule === 'GET' && method === 'HEAD') || (rule === 'WRITE' && !READS.includes(method));

export const requiredPermission = (method, path) =>
  ACCESS.find(([m, re]) => methodMatches(m, method) && re.test(path))?.[2] ?? null;

/** Loads the signed-in user from the session cookie into req.user (or leaves it undefined). */
export async function loadUser(req, res, next) {
  const user = await sessionUser(req.cookies?.[SESSION_COOKIE]);
  if (user) req.user = user;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) throw new HttpError(401, 'Sign in required');
  if (req.user.must_change_password) {
    return res.status(403).json({ error: 'You must change your password first', code: 'PASSWORD_CHANGE_REQUIRED' });
  }
  next();
}

/** 401 = who are you? (not signed in) · 403 = I know you, but you may not. */
export function authorize(req, res, next) {
  const perm = requiredPermission(req.method, req.path);
  const perms = perm ? [].concat(perm) : [];
  if (req.user.role === 'admin' || perms.some((p) => can(req.user, p))) return next();
  throw new HttpError(403, perm ? `Your role cannot do this (needs ${perms.join(' or ')})` : 'Access denied');
}

export const requirePermission = (perm) => (req, res, next) => {
  if (!can(req.user, perm)) throw new HttpError(403, `Your role cannot do this (needs ${perm})`);
  next();
};

/**
 * CSRF defense in depth (on top of SameSite=Strict): a state-changing request must come from our own frontend.
 * Browsers always send Origin on cross-site POST/PUT/DELETE and can't let a page fake it.
 */
export const checkOrigin = (allowed) => (req, res, next) => {
  if (READS.includes(req.method) || req.method === 'OPTIONS') return next();
  const origin = req.get('origin');
  if (req.get('sec-fetch-site') === 'cross-site' || (origin && !allowed.includes(origin))) {
    throw new HttpError(403, 'Cross-site request refused');
  }
  next();
};

/** With REQUIRE_HTTPS=true, plain-HTTP API calls are refused (behind a proxy, `trust proxy` reads X-Forwarded-Proto). */
export const requireHttps = (req, res, next) => {
  if (process.env.REQUIRE_HTTPS === 'true' && !req.secure) throw new HttpError(403, 'HTTPS is required');
  next();
};
