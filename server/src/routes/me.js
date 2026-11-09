import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { config } from '../config.js';
import { HttpError, parse } from '../lib/http.js';
import { requireRole, clearSession } from '../lib/auth.js';
import { getCreatorProfile } from '../lib/creators.js';
import { logEvent } from '../lib/events.js';
import { mails } from '../lib/mailer.js';
import { registerDevice } from '../lib/push.js';
import { sniffDocument } from '../lib/images.js';
import { DOC_TYPES } from '../lib/payments.js';
import { formatAddress, shipsProduct } from '../lib/address.js';

const router = Router();
router.use(requireRole('creator'));

const empty = (v) => v === '' || v === null || v === undefined;
const optInt = (min = 0, max = 2_000_000_000) =>
  z.preprocess((v) => (empty(v) ? null : Number(v)), z.number({ message: 'יש להזין מספר' }).int('יש להזין מספר שלם').min(min).max(max).nullable());
const optText = (max = 200) =>
  z.preprocess((v) => (empty(v) ? null : String(v).trim() || null), z.string().max(max).nullable());
const handle = z.preprocess(
  (v) => (empty(v) ? null : String(v).trim().replace(/^@+/, '').replace(/^https?:\/\/(www\.)?(instagram|tiktok)\.com\/@?/i, '').replace(/\/.*$/, '') || null),
  z.string().max(60).regex(/^[\w.]+$/, 'שם משתמש לא תקין').nullable(),
);
const url = z.string().trim().max(500).url('קישור לא תקין').refine((u) => /^https?:\/\//i.test(u), 'קישור לא תקין');

const thisYear = new Date().getFullYear();

const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'שדה חובה').max(100),
  birth_year: optInt(1930, thisYear - 13),
  city: optText(100),
  region_id: optInt(1),

  instagram_handle: handle,
  instagram_followers: optInt(),
  tiktok_handle: handle,
  tiktok_followers: optInt(),
  youtube_url: z.preprocess((v) => (empty(v) ? null : v), url.nullable()),
  other_platforms: optText(300),

  audience_gender: z.preprocess((v) => (empty(v) ? null : v), z.enum(['mostly_women', 'mostly_men', 'mixed']).nullable()),
  audience_age_min: optInt(0, 100),
  audience_age_max: optInt(0, 100),
  audience_sector: optText(50),

  open_to_paid: z.boolean().default(true),
  open_to_barter: z.boolean().default(true),
  open_to_events: z.boolean().default(false),
  open_to_affiliate: z.boolean().default(false),
  billing_status: z.enum(['osek_patur', 'osek_murshe', 'company', 'none']).default('none'),

  // Home address for shipping products; she ticks that it's correct
  address_street: optText(150),
  address_apt: optText(60),
  address_city: optText(80),
  address_zip: z.preprocess((v) => (empty(v) ? null : String(v).replace(/\s/g, '')), z.string().regex(/^\d{5,7}$/, 'מיקוד לא תקין').nullable()),
  address_confirmed: z.boolean().default(false),

  niches: z.array(z.number().int().positive()).min(1, 'יש לבחור לפחות תחום אחד').max(5, 'עד 5 תחומים'),
  links: z.array(z.object({ url, label: optText(80) })).max(10).default([]),

  // read_to_end: the client unlocks the checkbox only after the terms were scrolled to the end
  terms_accept: z.object({ version: z.string(), read_to_end: z.boolean().optional() }).optional(),
})
  .refine((p) => p.instagram_handle || p.tiktok_handle, { path: ['instagram_handle'], message: 'יש להזין לפחות חשבון אינסטגרם או טיקטוק' })
  .refine((p) => !p.instagram_handle || p.instagram_followers != null, { path: ['instagram_followers'], message: 'כמה עוקבים יש באינסטגרם?' })
  .refine((p) => !p.tiktok_handle || p.tiktok_followers != null, { path: ['tiktok_followers'], message: 'כמה עוקבים יש בטיקטוק?' })
  .refine((p) => !p.open_to_barter || p.address_street, { path: ['address_street'], message: 'כתובת למשלוח מוצרים (רחוב ומספר)' })
  .refine((p) => !p.open_to_barter || p.address_city, { path: ['address_city'], message: 'באיזו עיר?' })
  .refine((p) => !p.address_street || p.address_city, { path: ['address_city'], message: 'באיזו עיר?' })
  .refine((p) => !p.address_street || p.address_confirmed, { path: ['address_confirmed'], message: 'יש לאשר שהכתובת נכונה' })
  .refine((p) => p.audience_age_min == null || p.audience_age_max == null || p.audience_age_min <= p.audience_age_max,
    { path: ['audience_age_max'], message: 'טווח גילאים לא תקין' });

const PROFILE_COLUMNS = [
  'full_name', 'birth_year', 'city', 'region_id',
  'instagram_handle', 'instagram_followers', 'tiktok_handle', 'tiktok_followers', 'youtube_url', 'other_platforms',
  'audience_gender', 'audience_age_min', 'audience_age_max', 'audience_sector',
  'open_to_paid', 'open_to_barter', 'open_to_events', 'open_to_affiliate',
  'billing_status',
  'address_street', 'address_apt', 'address_city', 'address_zip',
];

router.get('/profile', async (req, res) => {
  res.json({ profile: await getCreatorProfile(req.user.id) });
});

router.put('/profile', async (req, res) => {
  const data = parse(profileSchema, req.body);
  const existing = await one('SELECT terms_version FROM creators WHERE user_id = $1', [req.user.id]);

  const accepting = data.terms_accept?.version === config.termsVersion;
  if (data.terms_accept && !accepting) {
    throw new HttpError(409, 'terms_version_mismatch', 'גרסת התנאים התעדכנה — יש לרענן את הדף', { current: config.termsVersion });
  }
  if (!existing && !accepting) {
    throw new HttpError(400, 'terms_required', 'יש לאשר את תנאי הקהילה', { fields: { terms_accept: 'יש לאשר את תנאי הקהילה' } });
  }

  const values = PROFILE_COLUMNS.map((c) => data[c]);
  await tx(async (db) => {
    if (!existing) {
      const cols = [...PROFILE_COLUMNS, 'terms_version', 'terms_ip'];
      await db.query(
        `INSERT INTO creators (user_id, ${cols.join(', ')}, terms_accepted_at, address_confirmed_at)
         VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')}, now(), ${data.address_street ? 'now()' : 'NULL'})`,
        [req.user.id, ...values, config.termsVersion, req.ip],
      );
    } else {
      const sets = PROFILE_COLUMNS.map((c, i) => `${c} = $${i + 2}`);
      sets.push(`address_confirmed_at = ${data.address_street ? 'now()' : 'NULL'}`);
      if (accepting) sets.push(`terms_version = $${values.length + 2}`, 'terms_accepted_at = now()', `terms_ip = $${values.length + 3}`);
      await db.query(
        `UPDATE creators SET ${sets.join(', ')}, updated_at = now() WHERE user_id = $1`,
        [req.user.id, ...values, ...(accepting ? [config.termsVersion, req.ip] : [])],
      );
    }

    await db.query('DELETE FROM creator_niches WHERE creator_id = $1', [req.user.id]);
    await db.query(
      `INSERT INTO creator_niches (creator_id, niche_id)
       SELECT $1, id FROM niches WHERE id = ANY($2::int[])`,
      [req.user.id, [...new Set(data.niches)]],
    );
    await db.query('DELETE FROM creator_links WHERE creator_id = $1', [req.user.id]);
    for (const [i, link] of data.links.entries()) {
      await db.query('INSERT INTO creator_links (creator_id, url, label, sort) VALUES ($1, $2, $3, $4)',
        [req.user.id, link.url, link.label, i]);
    }

    if (accepting) {
      await logEvent(req.user.id, 'terms_accepted',
        { version: config.termsVersion, ip: req.ip, read_to_end: data.terms_accept.read_to_end === true }, db);
    }
    await logEvent(req.user.id, existing ? 'profile_updated' : 'profile_created', null, db);
  });

  if (!existing) {
    await Promise.all([mails.signupReceived(req.user.email), mails.newSignup(data.full_name, req.user.email)]);
  }
  res.status(existing ? 200 : 201).json({ profile: await getCreatorProfile(req.user.id) });
});

/** Re-accept updated terms (the forced modal on login, spec §3.3). */
router.post('/terms', async (req, res) => {
  const { version, read_to_end } = parse(z.object({ version: z.string(), read_to_end: z.boolean().optional() }), req.body);
  if (version !== config.termsVersion) {
    throw new HttpError(409, 'terms_version_mismatch', 'גרסת התנאים התעדכנה — יש לרענן את הדף', { current: config.termsVersion });
  }
  const row = await one(
    `UPDATE creators SET terms_version = $2, terms_accepted_at = now(), terms_ip = $3, updated_at = now()
     WHERE user_id = $1 RETURNING terms_version, terms_accepted_at`,
    [req.user.id, version, req.ip],
  );
  if (!row) throw new HttpError(400, 'no_profile', 'יש להשלים את הפרופיל');
  await logEvent(req.user.id, 'terms_accepted', { version, ip: req.ip, read_to_end: read_to_end === true });
  res.json(row);
});

/** The app registers its push token after the user allows notifications. */
router.post('/devices', async (req, res) => {
  const { token, platform } = parse(z.object({
    token: z.string().min(20).max(4096),
    platform: z.enum(['ios', 'android']),
  }), req.body);
  await registerDevice(req.user.id, token, platform);
  res.json({ ok: true });
});

router.get('/applications', async (req, res) => {
  const { rows } = await query(
    `SELECT a.id, a.status, a.message, a.applied_at, a.decided_at, a.paid_at,
            EXISTS (SELECT 1 FROM invoices i WHERE i.application_id = a.id) AS has_invoice,
            c.slug, c.title, c.brand_display_name, c.type, c.status AS campaign_status,
            c.deadline_apply, c.deadline_publish
     FROM applications a JOIN campaigns c ON c.id = a.campaign_id
     WHERE a.creator_id = $1
     ORDER BY a.applied_at DESC`,
    [req.user.id],
  );
  res.json({ applications: rows });
});

// ---------- account deletion (from the app or the site) ----------

/**
 * Deletes the account and all her data. Kept: invoices in payment_archive (tax records) and the
 * record of the terms she accepted (deleted_accounts), since §3 and §5 outlive the membership.
 * Noa is told, including whether a payment is still open.
 */
router.delete('/account', async (req, res) => {
  parse(z.object({
    confirm: z.literal('מחיקה', { message: 'יש להקליד "מחיקה" לאישור' }),
    acknowledge_terms: z.literal(true, { message: 'יש לאשר שקראת את ההסבר על התנאים' }),
  }), req.body);
  const result = await tx(async (db) => {
    const { rows: [who] } = await db.query(
      `SELECT u.email, u.phone, u.created_at, c.full_name, c.instagram_handle, c.terms_version, c.terms_accepted_at, c.terms_ip
       FROM users u LEFT JOIN creators c ON c.user_id = u.id WHERE u.id = $1 FOR UPDATE OF u`,
      [req.user.id],
    );
    await db.query(
      `INSERT INTO deleted_accounts (full_name, email, phone, instagram_handle, joined_at, terms_version, terms_accepted_at, terms_ip, deleted_ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [who.full_name, who.email, who.phone, who.instagram_handle, who.created_at, who.terms_version, who.terms_accepted_at, who.terms_ip, req.ip],
    );
    const { rows: archived } = await db.query(
      `INSERT INTO payment_archive (creator_name, creator_email, campaign_title, doc_type, amount_ils,
         account_holder, bank_name, branch, account_number, uploaded_at, paid_at, file_mime, file_name, file_data)
       SELECT $2, $3, c.title, i.doc_type, i.amount_ils, i.account_holder, i.bank_name, i.branch, i.account_number,
              i.uploaded_at, a.paid_at, f.mime, f.file_name, f.data
       FROM invoices i JOIN applications a ON a.id = i.application_id JOIN campaigns c ON c.id = a.campaign_id
       JOIN invoice_files f ON f.id = i.file_id
       WHERE a.creator_id = $1
       RETURNING paid_at`,
      [req.user.id, who.full_name, who.email],
    );
    // Invoices first: their files would otherwise be removed before the rows pointing at them
    await db.query('DELETE FROM invoices WHERE application_id IN (SELECT id FROM applications WHERE creator_id = $1)', [req.user.id]);
    await db.query('DELETE FROM events WHERE user_id = $1', [req.user.id]);
    await db.query('DELETE FROM users WHERE id = $1', [req.user.id]); // cascades to profile, applications, devices…
    await db.query(`INSERT INTO events (user_id, type, payload) VALUES (NULL, 'account_deleted', $1)`,
      [{ invoices_archived: archived.length }]);
    return { ...who, archived: archived.length, unpaid: archived.filter((r) => !r.paid_at).length };
  });
  clearSession(res);
  await mails.accountDeleted(result);
  res.json({ ok: true });
});

// ---------- shipping address (selected for a campaign with a product) ----------

/** Confirms (or corrects) where to ship the product. Also updates the address in her profile. */
router.put('/applications/:id/address', async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) throw new HttpError(404, 'application_not_found');
  const data = parse(z.object({
    address_street: z.string().trim().min(2, 'רחוב ומספר בית').max(150),
    address_apt: optText(60),
    address_city: z.string().trim().min(2, 'באיזו עיר?').max(80),
    address_zip: z.preprocess((v) => (empty(v) ? null : String(v).replace(/\s/g, '')), z.string().regex(/^\d{5,7}$/, 'מיקוד לא תקין').nullable()),
  }), req.body);
  const app = await one(
    `SELECT a.id, a.status, c.type FROM applications a JOIN campaigns c ON c.id = a.campaign_id
     WHERE a.id = $1 AND a.creator_id = $2`,
    [req.params.id, req.user.id],
  );
  if (!app) throw new HttpError(404, 'application_not_found');
  if (!['selected', 'completed'].includes(app.status) || !shipsProduct(app.type)) {
    throw new HttpError(409, 'no_shipping', 'אין משלוח בקמפיין הזה');
  }
  await tx(async (db) => {
    await db.query(
      `UPDATE creators SET address_street = $2, address_apt = $3, address_city = $4, address_zip = $5,
         address_confirmed_at = now(), updated_at = now() WHERE user_id = $1`,
      [req.user.id, data.address_street, data.address_apt, data.address_city, data.address_zip],
    );
    await db.query('UPDATE applications SET shipping_address = $2, address_confirmed_at = now() WHERE id = $1',
      [app.id, formatAddress(data)]);
    await logEvent(req.user.id, 'shipping_address_confirmed', { application_id: app.id }, db);
  });
  res.json({ ok: true, shipping_address: formatAddress(data) });
});

// ---------- invoices (after Noa approves the video) ----------

/** Forget the bank details saved in her profile (the ones on past invoices stay, as payment records). */
router.delete('/bank', async (req, res) => {
  await query(
    `UPDATE creators SET bank_account_holder = NULL, bank_name = NULL, bank_branch = NULL, bank_account_number = NULL, updated_at = now()
     WHERE user_id = $1`,
    [req.user.id],
  );
  res.json({ ok: true });
});

const MAX_INVOICE_BYTES = 8 * 1024 * 1024;
const INVOICE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

// Files are stored in the database: cap uploads per creator so nobody can fill it up
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.isTest ? 10_000 : 30,
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: { error: 'rate_limited', message: 'יותר מדי העלאות, נסי שוב בעוד שעה' },
});

/** Step 1: upload the file itself (raw body). Step 2 (PUT below) attaches it with the details. */
router.post('/invoice-files', uploadLimiter, express.raw({ type: INVOICE_TYPES, limit: MAX_INVOICE_BYTES }), async (req, res) => {
  const buf = Buffer.isBuffer(req.body) ? req.body : null;
  const mime = buf && sniffDocument(buf);
  if (!mime) throw new HttpError(400, 'invalid_file', 'אפשר להעלות PDF או תמונה (JPG, PNG)');
  const name = typeof req.query.name === 'string' ? req.query.name.slice(0, 200) : null;
  const f = await one(
    'INSERT INTO invoice_files (user_id, mime, file_name, data, bytes) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [req.user.id, mime, name, buf, buf.length],
  );
  // Files uploaded but never attached to an invoice (an abandoned form) are removed after a day
  await query(
    `DELETE FROM invoice_files f WHERE f.user_id = $1 AND f.created_at < now() - interval '1 day'
       AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.file_id = f.id)`,
    [req.user.id],
  );
  res.status(201).json({ id: f.id });
});

const req1 = (max = 100) => z.string().trim().min(1, 'שדה חובה').max(max);
const invoiceSchema = z.object({
  file_id: z.string().uuid().optional(),
  doc_type: z.enum(Object.keys(DOC_TYPES), { message: 'יש לבחור סוג מסמך' }),
  amount_ils: z.preprocess((v) => (empty(v) ? undefined : Number(v)), z.number({ message: 'יש להזין סכום' }).positive('יש להזין סכום').max(1_000_000)),
  account_holder: req1(),
  bank_name: req1(),
  branch: z.string().trim().regex(/^\d{1,4}$/, 'מספר סניף לא תקין'),
  account_number: z.string().trim().regex(/^[\d-]{2,20}$/, 'מספר חשבון לא תקין'),
  save_bank: z.boolean().default(false), // keep the bank details in her profile for next time
});

router.put('/applications/:id/invoice', async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) throw new HttpError(404, 'application_not_found');
  const data = parse(invoiceSchema, req.body);
  const app = await one(
    `SELECT a.id, a.status, a.paid_at, c.type, c.title, c.slug, cr.full_name,
            (SELECT file_id FROM invoices WHERE application_id = a.id) AS current_file
     FROM applications a JOIN campaigns c ON c.id = a.campaign_id JOIN creators cr ON cr.user_id = a.creator_id
     WHERE a.id = $1 AND a.creator_id = $2`,
    [req.params.id, req.user.id],
  );
  if (!app) throw new HttpError(404, 'application_not_found');
  if (app.status !== 'completed' || app.type === 'barter') {
    throw new HttpError(409, 'invoice_not_open', 'אפשר להעלות חשבונית רק אחרי שנועה אישרה את הסרטון');
  }
  if (app.paid_at) throw new HttpError(409, 'already_paid', 'התשלום כבר בוצע. לשינוי פני לנועה.');
  const fileId = data.file_id || app.current_file;
  if (!fileId) throw new HttpError(400, 'validation_error', 'יש לצרף את החשבונית', { fields: { file: 'יש לצרף את החשבונית' } });
  if (data.file_id && !(await one('SELECT 1 FROM invoice_files WHERE id = $1 AND user_id = $2', [data.file_id, req.user.id]))) {
    throw new HttpError(400, 'validation_error', 'הקובץ לא נמצא, נסי להעלות שוב', { fields: { file: 'הקובץ לא נמצא, נסי להעלות שוב' } });
  }
  await query(
    `INSERT INTO invoices (application_id, file_id, doc_type, amount_ils, account_holder, bank_name, branch, account_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (application_id) DO UPDATE SET file_id = $2, doc_type = $3, amount_ils = $4, account_holder = $5,
       bank_name = $6, branch = $7, account_number = $8, updated_at = now()`,
    [app.id, fileId, data.doc_type, data.amount_ils, data.account_holder, data.bank_name, data.branch, data.account_number],
  );
  if (data.save_bank) {
    await query(
      `UPDATE creators SET bank_account_holder = $2, bank_name = $3, bank_branch = $4, bank_account_number = $5, updated_at = now()
       WHERE user_id = $1`,
      [req.user.id, data.account_holder, data.bank_name, data.branch, data.account_number],
    );
  }
  // The replaced file isn't needed anymore
  if (app.current_file && app.current_file !== fileId) await query('DELETE FROM invoice_files WHERE id = $1', [app.current_file]);
  await logEvent(req.user.id, 'invoice_uploaded', { application_id: app.id, replaced: !!app.current_file });
  if (!app.current_file) await mails.invoiceUploaded({ name: app.full_name, title: app.title, amount: data.amount_ils, docType: DOC_TYPES[data.doc_type] });
  res.json({ ok: true });
});

export default router;
