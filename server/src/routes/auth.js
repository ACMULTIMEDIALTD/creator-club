import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { one, query } from '../db.js';
import { config } from '../config.js';
import { HttpError, parse } from '../lib/http.js';
import { setSession, clearSession, requireAuth } from '../lib/auth.js';
import { unregisterDevice } from '../lib/push.js';
import { normalizePhone } from '../lib/phone.js';
import { logEvent } from '../lib/events.js';
import { mails } from '../lib/mailer.js';
import { suggestEmail } from '../lib/emailTypos.js';

const router = Router();
const MAGIC_TTL_MIN = 30;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 10_000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'יותר מדי ניסיונות, נסי שוב בעוד כמה דקות' },
});

// Per-email limit on top of the per-IP one: slows password/code guessing against one account even
// from many addresses, and stops flooding someone's inbox with sign-in emails.
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 10_000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `email:${String(req.body?.email || '').trim().toLowerCase()}`,
  message: { error: 'rate_limited', message: 'יותר מדי ניסיונות, נסי שוב בעוד כמה דקות' },
});

// Compared against when the email is unknown, so the answer takes the same time either way
const DUMMY_HASH = bcrypt.hashSync('no-such-user-dummy-password', 12);

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
// The code is only 6 digits, so it's hashed with the server secret and bound to the user
const codeHash = (userId, code) => crypto.createHmac('sha256', config.jwtSecret).update(`login-code:${userId}:${code}`).digest('hex');
const MAX_CODE_ATTEMPTS = 5;

/** Only allow same-app relative redirects ("/c/abc"), never "//evil.com" or absolute URLs. */
export function safeNext(next) {
  return typeof next === 'string' && /^\/(?![/\\])/.test(next) ? next : null;
}

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email('כתובת מייל לא תקינה'),
  phone: z.string().trim().transform(normalizePhone).refine((p) => p && /^0\d{8,9}$/.test(p), 'מספר טלפון לא תקין'),
  password: z.string().min(8, 'סיסמה של 8 תווים לפחות').max(200).optional().or(z.literal('').transform(() => undefined)),
});

router.post('/signup', limiter, async (req, res) => {
  const { email, phone, password } = parse(signupSchema, req.body);
  const meant = suggestEmail(email);
  if (meant) {
    throw new HttpError(400, 'validation_error', `נראה שיש טעות הקלדה במייל. התכוונת ל-${meant}?`, {
      fields: { email: `התכוונת ל-${meant}?` }, suggestion: meant,
    });
  }
  if (!password && !config.mailEnabled) {
    // No email sign-in links yet → without a password she could never log in again
    throw new HttpError(400, 'validation_error', 'יש לבחור סיסמה', { fields: { password: 'יש לבחור סיסמה (8 תווים לפחות)' } });
  }
  const exists = await one('SELECT email, phone FROM users WHERE email = $1 OR phone = $2', [email, phone]);
  if (exists) {
    const field = exists.email.toLowerCase() === email ? 'email' : 'phone';
    throw new HttpError(409, `${field}_taken`, field === 'email'
      ? 'המייל הזה כבר רשום — אפשר להתחבר'
      : 'מספר הטלפון הזה כבר רשום — אפשר להתחבר');
  }
  const hash = password ? await bcrypt.hash(password, 12) : null;
  const user = await one(
    `INSERT INTO users (email, phone, password_hash) VALUES ($1, $2, $3)
     RETURNING id, email, phone, role, status`,
    [email, phone, hash],
  );
  await logEvent(user.id, 'signup', { ip: req.ip, app: req.get('X-Client') === 'app' });
  const token = await setSession(req, res, user, 'signup');
  res.status(201).json({ user, token });
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('כתובת מייל לא תקינה'),
  password: z.string().optional(),
  next: z.string().nullish(), // the login page sends null when there's no ?next=
});

router.post('/login', limiter, emailLimiter, async (req, res) => {
  const { email, password, next } = parse(loginSchema, req.body);
  const user = await one('SELECT id, email, phone, role, status, password_hash FROM users WHERE email = $1', [email]);

  if (!password) {
    if (!config.mailEnabled) {
      throw new HttpError(400, 'mail_disabled', 'כניסה עם קישור למייל לא זמינה כרגע. היכנסי עם סיסמה.');
    }
    // Magic link. Same response whether or not the email exists (no account enumeration).
    if (user && !['suspended', 'left'].includes(user.status)) {
      const token = crypto.randomBytes(32).toString('base64url');
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      // A new request replaces older unused links/codes, so only the latest email works
      await query('UPDATE magic_links SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
      await query(
        `INSERT INTO magic_links (token, user_id, expires_at, code_hash) VALUES ($1, $2, now() + make_interval(mins => $3), $4)`,
        [sha256(token), user.id, MAGIC_TTL_MIN, codeHash(user.id, code)],
      );
      const qs = safeNext(next) ? `?next=${encodeURIComponent(next)}` : '';
      // /m/<token> is a client page: in a browser it signs in there; on a phone with the app
      // installed the same https link opens the app (universal / app links). The code is for the
      // home-screen web app, which has its own storage and can't be reached by a link.
      await mails.magicLink(user.email, `${config.appUrl}/m/${token}${qs}`, code);
    }
    return res.json({ ok: true, magic: true });
  }

  const valid = (await bcrypt.compare(password, user?.password_hash || DUMMY_HASH)) && !!user?.password_hash;
  if (!valid) throw new HttpError(401, 'invalid_credentials', 'מייל או סיסמה שגויים');
  if (['suspended', 'left'].includes(user.status)) throw new HttpError(403, 'account_inactive', 'החשבון אינו פעיל');

  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  await logEvent(user.id, 'login', { method: 'password' });
  const token = await setSession(req, res, user, 'password');
  delete user.password_hash;
  res.json({ user, token });
});

/** Consume a magic-link token (single use). Returns null when expired/used/suspended. */
async function consumeMagic(raw) {
  const link = await one(
    `UPDATE magic_links SET used_at = now()
     WHERE token = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [sha256(raw)],
  );
  const user = link && (await one('SELECT id, email, phone, role, status FROM users WHERE id = $1', [link.user_id]));
  if (!user || ['suspended', 'left'].includes(user.status)) return null;
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  await logEvent(user.id, 'login', { method: 'magic' });
  return user;
}

/** Sign in by typing the 6-digit code from the email (stays inside the home-screen app). */
router.post('/code', limiter, emailLimiter, async (req, res) => {
  const { email, code } = parse(z.object({
    email: z.string().trim().toLowerCase().email('כתובת מייל לא תקינה'),
    code: z.string().trim().regex(/^\d{6}$/, 'הקוד הוא 6 ספרות'),
  }), req.body);
  const bad = () => new HttpError(401, 'invalid_code', 'הקוד שגוי או שפג תוקפו. אפשר לבקש קוד חדש.');

  const user = await one('SELECT id, email, phone, role, status FROM users WHERE email = $1', [email]);
  if (!user || ['suspended', 'left'].includes(user.status)) throw bad();
  const link = await one(
    `SELECT token, code_hash, attempts FROM magic_links
     WHERE user_id = $1 AND used_at IS NULL AND expires_at > now() AND code_hash IS NOT NULL
     ORDER BY expires_at DESC LIMIT 1`,
    [user.id],
  );
  if (!link || link.attempts >= MAX_CODE_ATTEMPTS) throw bad();

  const given = Buffer.from(codeHash(user.id, code));
  const expected = Buffer.from(link.code_hash);
  if (!crypto.timingSafeEqual(given, expected)) {
    // Too many wrong guesses burn the code
    await query(
      `UPDATE magic_links SET attempts = attempts + 1,
         used_at = CASE WHEN attempts + 1 >= $2 THEN now() ELSE used_at END
       WHERE token = $1`,
      [link.token, MAX_CODE_ATTEMPTS],
    );
    throw bad();
  }

  await query('UPDATE magic_links SET used_at = now() WHERE token = $1', [link.token]);
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  await logEvent(user.id, 'login', { method: 'code' });
  const token = await setSession(req, res, user, 'code');
  res.json({ user, token });
});

/** Used by the /m/:token page (web and app). */
router.post('/magic', limiter, async (req, res) => {
  const { token: raw } = parse(z.object({ token: z.string().min(10).max(200) }), req.body);
  const user = await consumeMagic(raw);
  if (!user) throw new HttpError(410, 'link_expired', 'הקישור פג תוקף או שכבר נעשה בו שימוש. אפשר לבקש קישור חדש.');
  const token = await setSession(req, res, user, 'magic');
  res.json({ user, token });
});

router.post('/logout', async (req, res) => {
  // The app passes its push token so this phone stops getting notifications for this account
  if (req.body?.push_token) await unregisterDevice(req.body.push_token);
  clearSession(res);
  res.json({ ok: true });
});

const RESET_WINDOW_MS = 30 * 60 * 1000;

/** Signed in with an emailed code/link in the last 30 minutes — proves access to the mailbox. */
const recentEmailLogin = (req) => ['code', 'magic'].includes(req.auth?.method)
  && Date.now() - req.auth.issuedAt < RESET_WINDOW_MS;

/**
 * Set or change the password. The current password is required, unless there is none yet or
 * she just signed in with an emailed code ("forgot password").
 */
router.post('/password', limiter, requireAuth, async (req, res) => {
  const { password, current_password: current } = parse(z.object({
    password: z.string().min(8, 'סיסמה של 8 תווים לפחות').max(200),
    current_password: z.string().max(200).optional(),
  }), req.body);
  const { password_hash: hash } = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (hash && !recentEmailLogin(req)) {
    if (!current || !(await bcrypt.compare(current, hash))) {
      throw new HttpError(400, 'invalid_current_password', 'הסיסמה הנוכחית שגויה', {
        fields: { current_password: 'הסיסמה הנוכחית שגויה' },
      });
    }
  }
  // New password → every other session (other phones, an old stolen token) is signed out
  await query('UPDATE users SET password_hash = $1, session_version = session_version + 1 WHERE id = $2',
    [await bcrypt.hash(password, 12), req.user.id]);
  await logEvent(req.user.id, 'password_changed', { reset: !!hash && recentEmailLogin(req) });
  const token = await setSession(req, res, req.user, 'password'); // this device stays signed in
  res.json({ ok: true, token });
});

router.get('/me', requireAuth, async (req, res) => {
  const creator = await one(
    'SELECT full_name, terms_version, terms_accepted_at, open_to_barter, address_street FROM creators WHERE user_id = $1',
    [req.user.id],
  );
  res.json({
    user: req.user,
    profile: creator
      ? { full_name: creator.full_name, terms_version: creator.terms_version, terms_accepted_at: creator.terms_accepted_at }
      : null,
    needs_profile: req.user.role === 'creator' && !creator,
    needs_terms: !!creator && creator.terms_version !== config.termsVersion,
    // Signed up before the address field existed (or removed it) while open to barter
    needs_address: !!creator && creator.open_to_barter && !creator.address_street,
    terms: { version: config.termsVersion, pdf_url: config.termsPdfUrl },
    whatsapp_group_url: req.user.status === 'active' ? config.whatsappGroupUrl || null : null,
    has_password: !!(await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id])).password_hash,
    can_reset_password: recentEmailLogin(req),
  });
});

export default router;
