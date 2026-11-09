import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one, query, tx } from '../../db.js';
import { HttpError, notFound, parse } from '../../lib/http.js';
import { getCreatorProfile } from '../../lib/creators.js';
import { toCsv, sendCsv } from '../../lib/csv.js';
import { logEvent } from '../../lib/events.js';
import { mails } from '../../lib/mailer.js';
import { sendPush } from '../../lib/push.js';
import { formatAddress } from '../../lib/address.js';

const router = Router();

const MAX_F = 'GREATEST(COALESCE(c.instagram_followers, 0), COALESCE(c.tiktok_followers, 0))';
const OPEN_TO = { paid: 'open_to_paid', barter: 'open_to_barter', events: 'open_to_events', affiliate: 'open_to_affiliate' };
const SORTS = {
  created: 'u.created_at DESC',
  followers: `${MAX_F} DESC, u.created_at DESC`,
  name: 'c.full_name ASC NULLS LAST',
};

const ids = (v) => String(v ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);

/** Builds the WHERE clause for list + CSV from the query string. */
function buildFilters(q) {
  const where = [`u.role = 'creator'`];
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length}`; };

  const codeMatch = q.q?.trim().match(/^C-?([0-9a-f]{6})$/i);
  if (codeMatch) {
    where.push(`replace(u.id::text, '-', '') LIKE ${p(`${codeMatch[1].toLowerCase()}%`)}`);
  } else if (q.q?.trim()) {
    const term = p(`%${q.q.trim().replace(/^@/, '')}%`);
    where.push(`(c.full_name ILIKE ${term} OR u.email ILIKE ${term} OR u.phone ILIKE ${term}
      OR c.instagram_handle ILIKE ${term} OR c.tiktok_handle ILIKE ${term} OR c.city ILIKE ${term})`);
  }
  const niches = ids(q.niche);
  if (niches.length) where.push(`EXISTS (SELECT 1 FROM creator_niches cn WHERE cn.creator_id = u.id AND cn.niche_id = ANY(${p(niches)}::int[]))`);
  const regions = ids(q.region);
  if (regions.length) where.push(`c.region_id = ANY(${p(regions)}::int[])`);
  if (Number(q.min_followers) > 0) where.push(`${MAX_F} >= ${p(Number(q.min_followers))}`);
  if (Number(q.max_followers) > 0) where.push(`${MAX_F} <= ${p(Number(q.max_followers))}`);
  if (['A', 'B', 'new'].includes(q.tier)) where.push(`c.tier = ${p(q.tier)}`);
  if (['pending', 'active', 'suspended', 'left'].includes(q.status)) where.push(`u.status = ${p(q.status)}`);
  if (OPEN_TO[q.open_to]) where.push(`c.${OPEN_TO[q.open_to]}`);
  if (q.profile === 'incomplete') where.push('c.user_id IS NULL');
  if (q.profile === 'complete') where.push('c.user_id IS NOT NULL');

  return { where: where.join(' AND '), params, order: SORTS[q.sort] || SORTS.created };
}

async function listCreators(q) {
  const { where, params, order } = buildFilters(q);
  const { rows } = await query(
    `SELECT u.id, u.email, u.phone, u.status, u.created_at, u.last_login_at,
            c.user_id IS NOT NULL AS has_profile,
            c.full_name, c.city, c.birth_year, c.region_id, r.name AS region_name,
            c.instagram_handle, c.instagram_followers, c.tiktok_handle, c.tiktok_followers, c.youtube_url,
            ${MAX_F} AS max_followers,
            c.audience_gender, c.audience_age_min, c.audience_age_max, c.audience_sector,
            c.open_to_paid, c.open_to_barter, c.open_to_events, c.open_to_affiliate,
            c.billing_status, c.address_street, c.address_apt, c.address_city, c.address_zip,
            c.tier, c.internal_rating, c.admin_notes, c.terms_version, c.terms_accepted_at,
            COALESCE((SELECT array_agg(n.name ORDER BY n.sort) FROM creator_niches cn JOIN niches n ON n.id = cn.niche_id
                      WHERE cn.creator_id = u.id), '{}') AS niches,
            (SELECT count(*) FROM applications a WHERE a.creator_id = u.id AND a.status IN ('selected','completed')) AS selected_count
     FROM users u
     LEFT JOIN creators c ON c.user_id = u.id
     LEFT JOIN regions r ON r.id = c.region_id
     WHERE ${where}
     ORDER BY ${order}
     LIMIT 2000`,
    params,
  );
  return rows;
}

router.get('/', async (req, res) => {
  res.json({ creators: await listCreators(req.query) });
});

const GENDER = { mostly_women: 'בעיקר נשים', mostly_men: 'בעיקר גברים', mixed: 'מעורב' };
const BILLING = { osek_patur: 'עוסק פטור', osek_murshe: 'עוסק מורשה', company: 'חברה', none: 'אין' };
const STATUS = { pending: 'ממתינה', active: 'פעילה', suspended: 'מושעית', left: 'עזבה' };
const yesNo = (b) => (b == null ? '' : b ? 'כן' : 'לא');

export const CREATOR_CSV_COLUMNS = [
  ['שם', (r) => r.full_name],
  ['טלפון', (r) => r.phone],
  ['מייל', (r) => r.email],
  ['עיר', (r) => r.city],
  ['אזור', (r) => r.region_name],
  ['אינסטגרם', (r) => (r.instagram_handle ? `https://instagram.com/${r.instagram_handle}` : '')],
  ['עוקבים באינסטגרם', (r) => r.instagram_followers],
  ['טיקטוק', (r) => (r.tiktok_handle ? `https://tiktok.com/@${r.tiktok_handle}` : '')],
  ['עוקבים בטיקטוק', (r) => r.tiktok_followers],
  ['יוטיוב', (r) => r.youtube_url],
  ['תחומים', (r) => r.niches],
  ['קהל', (r) => GENDER[r.audience_gender]],
  ['גילאי קהל', (r) => (r.audience_age_min || r.audience_age_max ? `${r.audience_age_min ?? ''}-${r.audience_age_max ?? ''}` : '')],
  ['מגזר', (r) => r.audience_sector],
  // On a campaign export, the address she confirmed for that campaign wins over the profile one
  ['כתובת למשלוח', (r) => r.shipping_address || formatAddress(r)],
];

/**
 * Short stable code per creator. Appears in both files, so when a brand picks "C-3F9A12" from the
 * anonymous list, Noa finds her in her own file.
 */
export const creatorCode = (id) => `C-${String(id).replace(/-/g, '').slice(0, 6).toUpperCase()}`;

const thisYear = () => new Date().getFullYear();

/**
 * For brands: everything that helps them choose, nothing that identifies or lets them reach the
 * creator directly (no name, contact details, handles, links or city). Keeps Noa in the middle.
 */
const BRAND_CSV_COLUMNS = [
  ['קוד יוצרת', (r) => creatorCode(r.id)],
  ['אזור', (r) => r.region_name],
  ['גיל', (r) => (r.birth_year ? thisYear() - r.birth_year : '')],
  ['תחומים', (r) => r.niches],
  ['עוקבים באינסטגרם', (r) => r.instagram_followers],
  ['עוקבים בטיקטוק', (r) => r.tiktok_followers],
  ['ערוץ יוטיוב', (r) => yesNo(!!r.youtube_url)],
  ['קהל', (r) => GENDER[r.audience_gender]],
  ['גילאי קהל', (r) => (r.audience_age_min || r.audience_age_max ? `${r.audience_age_min ?? ''}-${r.audience_age_max ?? ''}` : '')],
  ['מגזר', (r) => r.audience_sector],
  ['בתשלום', (r) => yesNo(r.open_to_paid)],
  ['בארטר', (r) => yesNo(r.open_to_barter)],
  ['אירועים', (r) => yesNo(r.open_to_events)],
];

const ADMIN_CSV_COLUMNS = [
  ['קוד יוצרת', (r) => creatorCode(r.id)],
  ...CREATOR_CSV_COLUMNS,
  ['שנת לידה', (r) => r.birth_year],
  ['בתשלום', (r) => yesNo(r.open_to_paid)],
  ['בארטר', (r) => yesNo(r.open_to_barter)],
  ['אירועים', (r) => yesNo(r.open_to_events)],
  ['שותפים', (r) => yesNo(r.open_to_affiliate)],
  ['סטטוס עסקי', (r) => BILLING[r.billing_status]],
  ['סטטוס', (r) => STATUS[r.status]],
  ['דרגה', (r) => r.tier],
  ['דירוג', (r) => r.internal_rating],
  ['הערות', (r) => r.admin_notes],
  ['קמפיינים', (r) => r.selected_count],
  ['תנאים', (r) => r.terms_version],
  ['נרשמה', (r) => r.created_at?.toISOString().slice(0, 10)],
];

// Must be registered before '/:id'
router.get('/export.csv', async (req, res) => {
  const rows = await listCreators(req.query);
  sendCsv(res, `creators-with-names-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(ADMIN_CSV_COLUMNS, rows));
});

/** Anonymous list for brands: active members with a profile only, same filters as the table. */
router.get('/export-brands.csv', async (req, res) => {
  const rows = (await listCreators({ ...req.query, status: 'active', profile: 'complete' }))
    .sort((a, b) => b.max_followers - a.max_followers);
  sendCsv(res, `creator-club-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(BRAND_CSV_COLUMNS, rows));
});

const uuid = z.string().uuid();

router.get('/:id', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) throw notFound('creator_not_found');
  const user = await one(
    `SELECT id, email, phone, role, status, created_at, last_login_at FROM users WHERE id = $1 AND role = 'creator'`,
    [req.params.id],
  );
  if (!user) throw notFound('creator_not_found');
  const [profile, apps, events] = await Promise.all([
    getCreatorProfile(user.id, { admin: true }),
    query(
      `SELECT a.id, a.status, a.message, a.admin_note, a.applied_at, a.decided_at,
              c.id AS campaign_id, c.title, c.slug, c.type
       FROM applications a JOIN campaigns c ON c.id = a.campaign_id
       WHERE a.creator_id = $1 ORDER BY a.applied_at DESC`,
      [user.id],
    ),
    query('SELECT type, payload, created_at FROM events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30', [user.id]),
  ]);
  res.json({ user, profile, applications: apps.rows, events: events.rows });
});

const patchSchema = z.object({
  // Noa fixes a mistyped address (otherwise she gets no codes or emails at all)
  email: z.string().trim().toLowerCase().email('כתובת מייל לא תקינה').max(200).optional(),
  status: z.enum(['pending', 'active', 'suspended', 'left']).optional(),
  tier: z.enum(['A', 'B', 'new']).optional(),
  admin_notes: z.string().max(5000).nullable().optional(),
  internal_rating: z.number().int().min(1).max(5).nullable().optional(),
});

router.patch('/:id', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) throw notFound('creator_not_found');
  const data = parse(patchSchema, req.body);

  const result = await tx(async (db) => {
    const { rows: [user] } = await db.query(
      `SELECT u.id, u.email, u.status, c.user_id IS NOT NULL AS has_profile
       FROM users u LEFT JOIN creators c ON c.user_id = u.id
       WHERE u.id = $1 AND u.role = 'creator' FOR UPDATE OF u`,
      [req.params.id],
    );
    if (!user) throw notFound('creator_not_found');

    if (data.email && data.email !== user.email.toLowerCase()) {
      const taken = await db.query('SELECT 1 FROM users WHERE email = $1 AND id <> $2', [data.email, user.id]);
      if (taken.rowCount) throw new HttpError(409, 'email_taken', 'המייל הזה כבר רשום לחשבון אחר', { fields: { email: 'המייל הזה כבר רשום לחשבון אחר' } });
      await db.query('UPDATE users SET email = $2 WHERE id = $1', [user.id, data.email]);
      // Codes/links sent to the old address stop working
      await db.query('UPDATE magic_links SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
      await logEvent(req.user.id, 'creator_email_changed', { creator_id: user.id, from: user.email, to: data.email }, db);
      user.email = data.email;
    }

    if (data.status && data.status !== user.status) {
      if (data.status === 'active' && !user.has_profile) {
        throw new HttpError(400, 'no_profile', 'אי אפשר לאשר יוצרת שלא השלימה פרופיל');
      }
      await db.query('UPDATE users SET status = $2 WHERE id = $1', [user.id, data.status]);
      await logEvent(req.user.id, 'creator_status_changed', { creator_id: user.id, from: user.status, to: data.status }, db);
    }

    const sets = [];
    const params = [user.id];
    for (const f of ['tier', 'admin_notes', 'internal_rating']) {
      if (data[f] !== undefined) { params.push(data[f]); sets.push(`${f} = $${params.length}`); }
    }
    if (sets.length) {
      if (!user.has_profile) throw new HttpError(400, 'no_profile', 'ליוצרת אין עדיין פרופיל');
      await db.query(`UPDATE creators SET ${sets.join(', ')}, updated_at = now() WHERE user_id = $1`, params);
    }
    return { user, approved: data.status === 'active' && user.status === 'pending' };
  });

  if (result.approved) {
    await mails.approved(result.user.email);
    await sendPush([result.user.id], { title: 'ברוכה הבאה לקהילה! 🎉', body: 'החברות שלך אושרה. הקמפיינים הפתוחים מחכים לך.', url: '/dashboard' });
  }
  const fresh = await one(
    `SELECT u.email, u.status, c.tier, c.admin_notes, c.internal_rating
     FROM users u LEFT JOIN creators c ON c.user_id = u.id WHERE u.id = $1`,
    [req.params.id],
  );
  res.json({ creator: { id: req.params.id, ...fresh } });
});

/**
 * Noa sets a temporary password for a creator who forgot hers (until email sign-in links exist).
 * Shown once in the response; Noa sends it on WhatsApp and the creator can keep using it.
 */
router.post('/:id/reset-password', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) throw notFound('creator_not_found');
  // No look-alike characters (0/O, 1/l/I) so it can be typed from a WhatsApp message
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const password = Array.from(crypto.randomBytes(10), (b) => alphabet[b % alphabet.length]).join('');
  const hash = await bcrypt.hash(password, 12);
  const user = await one(
    `UPDATE users SET password_hash = $2, session_version = session_version + 1 WHERE id = $1 AND role = 'creator' RETURNING id`,
    [req.params.id, hash],
  );
  if (!user) throw notFound('creator_not_found');
  await logEvent(req.user.id, 'password_reset_by_admin', { creator_id: user.id });
  res.json({ password });
});

export default router;
