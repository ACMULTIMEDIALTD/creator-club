import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../../db.js';
import { HttpError, notFound, parse } from '../../lib/http.js';
import { toCsv, sendCsv } from '../../lib/csv.js';
import { whatsappText } from '../../lib/whatsapp.js';
import { logEvent } from '../../lib/events.js';
import { CREATOR_CSV_COLUMNS } from './creators.js';
import { notifyCampaignOpened } from '../../lib/push.js';
import { INVOICE_COLUMNS, invoiceOut } from '../../lib/payments.js';
import { imageUrl } from '../../lib/images.js';

const router = Router();
const uuid = z.string().uuid();
const STATUSES = ['draft', 'open', 'closed', 'in_progress', 'done', 'cancelled'];
export const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'other'];

const nullable = (schema) => z.preprocess((v) => (v === '' || v === undefined ? null : v), schema.nullable());
const intIds = z.preprocess((v) => (Array.isArray(v) && v.length === 0 ? null : v), z.array(z.number().int().positive()).nullable());

const campaignSchema = z.object({
  brand_id: nullable(z.string().uuid()),
  title: z.string().trim().min(2, 'שדה חובה').max(150),
  brand_display_name: z.string().trim().min(1, 'שדה חובה').max(150),
  short_description: z.string().trim().min(5, 'שדה חובה').max(400, 'עד 400 תווים'),
  full_brief: nullable(z.string().max(20000)),
  type: z.enum(['paid', 'barter', 'hybrid']),
  product_value_ils: nullable(z.coerce.number().int().min(0)),
  payment_note: nullable(z.string().max(1000)),
  min_followers: z.coerce.number().int().min(0).default(0),
  platforms: z.array(z.enum(PLATFORMS)).min(1, 'יש לבחור פלטפורמה').default(['instagram']),
  required_niche_ids: intIds.default(null),
  region_ids: intIds.default(null),
  slots: z.coerce.number().int().min(1, 'לפחות מקום אחד').max(1000),
  deadline_apply: z.coerce.date({ message: 'תאריך לא תקין' }),
  deadline_publish: nullable(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'תאריך לא תקין')),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{2,39}$/, 'אותיות באנגלית, ספרות ומקפים (3–40)').optional(),
  status: z.enum(STATUSES).optional(),
  image_id: nullable(z.string().uuid()),
});

const FIELDS = [
  'brand_id', 'title', 'brand_display_name', 'short_description', 'full_brief', 'type', 'product_value_ils',
  'payment_note', 'min_followers', 'platforms', 'required_niche_ids', 'region_ids', 'slots',
  'deadline_apply', 'deadline_publish', 'slug', 'image_id',
];

const newSlug = () => crypto.randomBytes(4).toString('hex').slice(0, 6);

const COUNTS = `
  (SELECT count(*) FROM applications a WHERE a.campaign_id = c.id AND a.status = 'applied') AS applied_count,
  (SELECT count(*) FROM applications a WHERE a.campaign_id = c.id AND a.status IN ('selected','completed')) AS selected_count,
  (SELECT count(*) FROM applications a WHERE a.campaign_id = c.id AND a.status <> 'withdrawn') AS total_count`;

router.get('/', async (req, res) => {
  const params = [];
  let where = '';
  if (STATUSES.includes(req.query.status)) { params.push(req.query.status); where = 'WHERE c.status = $1'; }
  const { rows } = await query(
    `SELECT c.id, c.slug, c.title, c.brand_display_name, c.type, c.status, c.slots, c.min_followers,
            c.deadline_apply, c.deadline_publish, c.created_at, c.image_id, b.name AS brand_name, ${COUNTS}
     FROM campaigns c LEFT JOIN brands b ON b.id = c.brand_id
     ${where}
     ORDER BY CASE c.status WHEN 'open' THEN 0 WHEN 'draft' THEN 1 WHEN 'closed' THEN 2 WHEN 'in_progress' THEN 3 ELSE 4 END,
              c.deadline_apply DESC`,
    params,
  );
  res.json({ campaigns: rows.map((c) => ({ ...c, image_url: imageUrl(c.image_id) })) });
});

router.post('/', async (req, res) => {
  const d = parse(campaignSchema, req.body);
  // Spec: create → draft. Allow "save & publish" in one step only to 'open'.
  const status = d.status === 'open' ? 'open' : 'draft';
  for (let attempt = 0; ; attempt++) {
    const slug = d.slug || newSlug();
    try {
      const values = FIELDS.map((f) => (f === 'slug' ? slug : d[f] ?? null));
      const campaign = await one(
        `INSERT INTO campaigns (${FIELDS.join(', ')}, status, created_by)
         VALUES (${FIELDS.map((_, i) => `$${i + 1}`).join(', ')}, $${FIELDS.length + 1}, $${FIELDS.length + 2})
         RETURNING *`,
        [...values, status, req.user.id],
      );
      await logEvent(req.user.id, 'campaign_created', { campaign_id: campaign.id });
      if (campaign.status === 'open') await notifyCampaignOpened(campaign);
      return res.status(201).json({ campaign: { ...campaign, image_url: imageUrl(campaign.image_id) } });
    } catch (err) {
      if (err.code === '23505' && err.constraint?.includes('slug')) {
        if (d.slug) throw new HttpError(409, 'slug_taken', 'הכתובת הזו כבר בשימוש', { fields: { slug: 'הכתובת הזו כבר בשימוש' } });
        if (attempt < 5) continue;
      }
      if (err.code === '23503') throw new HttpError(400, 'reference_not_found', 'המותג או התמונה לא נמצאו');
      throw err;
    }
  }
});

async function getCampaign(id) {
  if (!uuid.safeParse(id).success) throw notFound('campaign_not_found');
  const c = await one(
    `SELECT c.*, b.name AS brand_name, ${COUNTS} FROM campaigns c LEFT JOIN brands b ON b.id = c.brand_id WHERE c.id = $1`,
    [id],
  );
  if (!c) throw notFound('campaign_not_found');
  return { ...c, image_url: imageUrl(c.image_id) };
}

router.get('/:id', async (req, res) => {
  res.json({ campaign: await getCampaign(req.params.id) });
});

router.patch('/:id', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) throw notFound('campaign_not_found');
  // .partial() keeps schema defaults out of the way for fields not sent
  const raw = req.body || {};
  const d = parse(campaignSchema.partial(), raw);
  const keys = FIELDS.filter((f) => f in raw && d[f] !== undefined);

  const result = await tx(async (db) => {
    const { rows: [cur] } = await db.query('SELECT id, status FROM campaigns WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!cur) throw notFound('campaign_not_found');

    if (keys.length) {
      await db.query(
        `UPDATE campaigns SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`,
        [cur.id, ...keys.map((k) => d[k])],
      );
    }

    let autoRejected = 0;
    if (d.status && d.status !== cur.status) {
      await db.query('UPDATE campaigns SET status = $2, updated_at = now() WHERE id = $1', [cur.id, d.status]);
      // Spec §3.6: closing rejects everyone still waiting, with a soft message in the UI.
      if (['closed', 'cancelled', 'in_progress', 'done'].includes(d.status)) {
        const r = await db.query(
          `UPDATE applications SET status = 'rejected', decided_at = now()
           WHERE campaign_id = $1 AND status = 'applied'`,
          [cur.id],
        );
        autoRejected = r.rowCount;
      }
      await logEvent(req.user.id, 'campaign_status_changed',
        { campaign_id: cur.id, from: cur.status, to: d.status, auto_rejected: autoRejected }, db);
    }
    return { autoRejected, opened: d.status === 'open' && cur.status !== 'open' };
  }).catch((err) => {
    if (err.code === '23505') throw new HttpError(409, 'slug_taken', 'הכתובת הזו כבר בשימוש', { fields: { slug: 'הכתובת הזו כבר בשימוש' } });
    if (err.code === '23503') throw new HttpError(400, 'reference_not_found', 'המותג או התמונה לא נמצאו');
    throw err;
  });

  const campaign = await getCampaign(req.params.id);
  if (result.opened) await notifyCampaignOpened(campaign);
  res.json({ campaign, auto_rejected: result.autoRejected });
});

router.delete('/:id', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) throw notFound('campaign_not_found');
  const c = await one('SELECT status FROM campaigns WHERE id = $1', [req.params.id]);
  if (!c) throw notFound('campaign_not_found');
  if (c.status !== 'draft') throw new HttpError(409, 'not_draft', 'אפשר למחוק רק טיוטה. לקמפיין פעיל — בטלי אותו.');
  await query('DELETE FROM campaigns WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

const APPLICANTS_SQL = `
  SELECT a.id, a.status, a.message, a.admin_note, a.applied_at, a.decided_at, a.paid_at, a.shipping_address, a.address_confirmed_at, ${INVOICE_COLUMNS},
         u.id AS creator_id, u.email, u.phone, u.status AS user_status,
         cr.full_name, cr.city, r.name AS region_name,
         cr.instagram_handle, cr.instagram_followers, cr.tiktok_handle, cr.tiktok_followers, cr.youtube_url,
         GREATEST(COALESCE(cr.instagram_followers, 0), COALESCE(cr.tiktok_followers, 0)) AS max_followers,
         cr.audience_gender, cr.audience_age_min, cr.audience_age_max, cr.audience_sector,
         cr.tier, cr.internal_rating, cr.address_street, cr.address_apt, cr.address_city, cr.address_zip,
         COALESCE((SELECT array_agg(n.name ORDER BY n.sort) FROM creator_niches cn JOIN niches n ON n.id = cn.niche_id
                   WHERE cn.creator_id = u.id), '{}') AS niches
  FROM applications a
  JOIN users u ON u.id = a.creator_id
  JOIN creators cr ON cr.user_id = a.creator_id
  LEFT JOIN regions r ON r.id = cr.region_id
  LEFT JOIN invoices i ON i.application_id = a.id
  LEFT JOIN invoice_files f ON f.id = i.file_id
  WHERE a.campaign_id = $1`;

router.get('/:id/applications', async (req, res) => {
  const campaign = await getCampaign(req.params.id);
  const { rows } = await query(
    `${APPLICANTS_SQL}
     ORDER BY CASE a.status WHEN 'selected' THEN 0 WHEN 'completed' THEN 1 WHEN 'applied' THEN 2 WHEN 'rejected' THEN 3 ELSE 4 END,
              CASE cr.tier WHEN 'A' THEN 0 WHEN 'B' THEN 1 ELSE 2 END,
              max_followers DESC`,
    [campaign.id],
  );
  res.json({ campaign, applications: rows.map((r) => ({ ...r, invoice: invoiceOut(r) })) });
});

router.get('/:id/export.csv', async (req, res) => {
  const campaign = await getCampaign(req.params.id);
  const { rows } = await query(
    `${APPLICANTS_SQL} AND a.status IN ('selected','completed') ORDER BY cr.full_name`,
    [campaign.id],
  );
  const name = `${campaign.slug}-selected-${new Date().toISOString().slice(0, 10)}.csv`;
  sendCsv(res, name, toCsv(CREATOR_CSV_COLUMNS, rows));
});

router.get('/:id/whatsapp-text', async (req, res) => {
  const campaign = await getCampaign(req.params.id);
  res.json({ text: whatsappText(campaign) });
});

export default router;
