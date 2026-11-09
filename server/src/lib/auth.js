import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { one } from '../db.js';
import { HttpError } from './http.js';

export const COOKIE = 'cc_session';
const MAX_AGE_MS = 30 * 24 * 3600 * 1000; // 30 days — creators come back from WhatsApp links

const cookieOpts = () => ({
  httpOnly: true,
  secure: config.cookieSecure || config.cookieSameSite === 'none',
  sameSite: config.cookieSameSite,
  path: '/',
});

// `m` records how the session started (password / code / magic / signup), so a fresh sign-in by
// email code can set a new password without knowing the old one ("forgot password").
// `v` is the user's session_version: changing the password bumps it and ends all older sessions.
const signToken = (userId, method, version) => jwt.sign(
  { sub: userId, m: method, v: version }, config.jwtSecret, { algorithm: 'HS256', expiresIn: Math.floor(MAX_AGE_MS / 1000) },
);

/** The iPhone/Android app sends this header. It keeps its session as a bearer token, not a cookie. */
export const isApp = (req) => req.get('X-Client') === 'app';

/**
 * Starts a session. Browsers get an httpOnly cookie; the native app gets the token back
 * (returned value, to put in the JSON response) because WebView cookies to another host are unreliable.
 */
export async function setSession(req, res, user, method) {
  const { session_version: version } = await one('SELECT session_version FROM users WHERE id = $1', [user.id]);
  const token = signToken(user.id, method, version);
  res.cookie(COOKIE, token, { ...cookieOpts(), maxAge: MAX_AGE_MS });
  return isApp(req) ? token : undefined;
}

export function clearSession(res) {
  res.clearCookie(COOKIE, cookieOpts());
}

/**
 * Reads the session (bearer token from the app, else cookie) and loads the user fresh from the DB on every request,
 * so role/status changes (e.g. suspension) take effect immediately.
 */
export async function loadUser(req, _res, next) {
  const bearer = req.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  const token = bearer || req.cookies?.[COOKIE];
  if (!token) return next();
  try {
    const { sub, m, v, iat } = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    const user = await one('SELECT id, email, phone, role, status, session_version FROM users WHERE id = $1', [sub]);
    // Tokens from before a password change (or from before versions existed: v undefined → 0) are rejected
    if (user && (v ?? 0) === user.session_version) {
      delete user.session_version;
      req.user = user;
      req.auth = { method: m, issuedAt: iat * 1000 };
    }
  } catch {
    // invalid/expired token → treat as anonymous
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'unauthenticated', 'יש להתחבר'));
  if (req.user.status === 'suspended' || req.user.status === 'left') {
    return next(new HttpError(403, 'account_inactive', 'החשבון אינו פעיל'));
  }
  next();
}

export const requireRole = (role) => [
  requireAuth,
  (req, _res, next) => (req.user.role === role ? next() : next(new HttpError(403, 'forbidden'))),
];
