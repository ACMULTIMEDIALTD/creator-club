import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one, query } from '../../db.js';
import { HttpError, notFound, parse } from '../../lib/http.js';
import { logEvent } from '../../lib/events.js';
import { mails } from '../../lib/mailer.js';
import { suggestEmail } from '../../lib/emailTypos.js';
import { config } from '../../config.js';

const router = Router();
const uuid = z.string().uuid();

// The community owner (ADMIN_EMAIL: Noa) can never be removed, by anyone
const isOwner = (email) => !!config.adminEmail && String(email).toLowerCase() === config.adminEmail.toLowerCase();

// No look-alike characters (0/O, 1/l/I) so it can be typed from a WhatsApp message
const tempPassword = () => {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(12), (b) => alphabet[b % alphabet.length]).join('');
};

/** Everyone who can manage the community. */
router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT id, email, created_at, last_login_at FROM users
     WHERE role = 'admin' AND status = 'active' ORDER BY created_at`,
  );
  res.json({ admins: rows.map((a) => ({ ...a, me: a.id === req.user.id, owner: isOwner(a.email) })) });
});

/**
 * Add an admin. Returns a temporary password once (to send on WhatsApp); they can also sign in
 * with an emailed code. An address that belongs to a creator needs promote: true.
 */
router.post('/', async (req, res) => {
  const { email, promote } = parse(z.object({
    email: z.string().trim().toLowerCase().email('כתובת מייל לא תקינה').max(200),
    promote: z.boolean().optional(),
  }), req.body);
  const meant = suggestEmail(email);
  if (meant) throw new HttpError(400, 'validation_error', `התכוונת ל-${meant}?`, { fields: { email: `התכוונת ל-${meant}?` } });

  const password = tempPassword();
  const hash = await bcrypt.hash(password, 12);
  const existing = await one('SELECT id, role, status FROM users WHERE email = $1', [email]);
  let admin;
  if (existing?.role === 'admin' && existing.status === 'active') {
    throw new HttpError(409, 'already_admin', 'המייל הזה כבר מנהל', { fields: { email: 'המייל הזה כבר מנהל' } });
  } else if (existing && existing.role === 'creator' && !promote) {
    throw new HttpError(409, 'is_creator', 'המייל הזה רשום כיוצרת. אפשר להפוך אותו למנהל.', { fields: { email: 'המייל הזה רשום כיוצרת' } });
  } else if (existing) {
    // A removed admin coming back, or a creator account promoted on purpose
    admin = await one(
      `UPDATE users SET role = 'admin', status = 'active', password_hash = $2, session_version = session_version + 1
       WHERE id = $1 RETURNING id, email, created_at, last_login_at`,
      [existing.id, hash],
    );
  } else {
    admin = await one(
      `INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, 'admin', 'active')
       RETURNING id, email, created_at, last_login_at`,
      [email, hash],
    );
  }
  await logEvent(req.user.id, 'admin_added', { admin_id: admin.id, email, promoted: existing?.role === 'creator' });
  await mails.adminAdded(email, req.user.email);
  res.status(201).json({ admin, password });
});

/** Remove an admin's access (kept as a suspended user: campaigns they created still point to them). */
router.delete('/:id', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) throw notFound('admin_not_found');
  if (req.params.id === req.user.id) throw new HttpError(400, 'self', 'אי אפשר להסיר את עצמך');
  const target = await one(`SELECT email FROM users WHERE id = $1 AND role = 'admin'`, [req.params.id]);
  if (target && isOwner(target.email)) throw new HttpError(403, 'owner', 'אי אפשר להסיר את נועה, בעלת הקהילה');
  const removed = await one(
    `UPDATE users SET status = 'suspended', session_version = session_version + 1
     WHERE id = $1 AND role = 'admin' AND status = 'active' RETURNING id, email`,
    [req.params.id],
  );
  if (!removed) throw notFound('admin_not_found');
  await logEvent(req.user.id, 'admin_removed', { admin_id: removed.id, email: removed.email });
  res.json({ ok: true });
});

export default router;
