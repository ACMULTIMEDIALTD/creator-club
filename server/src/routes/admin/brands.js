import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../../db.js';
import { HttpError, notFound, parse } from '../../lib/http.js';

const router = Router();
const uuid = z.string().uuid();
const opt = (max) => z.preprocess((v) => (v === '' || v == null ? null : String(v).trim()), z.string().max(max).nullable()).optional();

const brandSchema = z.object({
  name: z.string().trim().min(1, 'שדה חובה').max(200),
  contact_name: opt(200),
  contact_phone: opt(50),
  contact_email: opt(200),
  agreement_signed_at: z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullable()).optional(),
  notes: opt(5000),
});
const FIELDS = ['name', 'contact_name', 'contact_phone', 'contact_email', 'agreement_signed_at', 'notes'];

router.get('/', async (_req, res) => {
  const { rows } = await query(
    `SELECT b.*, (SELECT count(*) FROM campaigns c WHERE c.brand_id = b.id) AS campaign_count
     FROM brands b ORDER BY b.name`,
  );
  res.json({ brands: rows });
});

router.post('/', async (req, res) => {
  const d = parse(brandSchema, req.body);
  const brand = await one(
    `INSERT INTO brands (${FIELDS.join(', ')}) VALUES (${FIELDS.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    FIELDS.map((f) => d[f] ?? null),
  );
  res.status(201).json({ brand });
});

router.get('/:id', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) throw notFound('brand_not_found');
  const brand = await one('SELECT * FROM brands WHERE id = $1', [req.params.id]);
  if (!brand) throw notFound('brand_not_found');
  const { rows: campaigns } = await query(
    'SELECT id, title, status, type, created_at FROM campaigns WHERE brand_id = $1 ORDER BY created_at DESC',
    [brand.id],
  );
  res.json({ brand, campaigns });
});

router.patch('/:id', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) throw notFound('brand_not_found');
  const d = parse(brandSchema.partial(), req.body);
  const keys = FIELDS.filter((f) => d[f] !== undefined);
  if (!keys.length) throw new HttpError(400, 'nothing_to_update');
  const brand = await one(
    `UPDATE brands SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
    [req.params.id, ...keys.map((k) => d[k])],
  );
  if (!brand) throw notFound('brand_not_found');
  res.json({ brand });
});

router.delete('/:id', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) throw notFound('brand_not_found');
  const used = await one('SELECT 1 FROM campaigns WHERE brand_id = $1 LIMIT 1', [req.params.id]);
  if (used) throw new HttpError(409, 'brand_in_use', 'למותג יש קמפיינים — אי אפשר למחוק');
  const { rowCount } = await query('DELETE FROM brands WHERE id = $1', [req.params.id]);
  if (!rowCount) throw notFound('brand_not_found');
  res.json({ ok: true });
});

export default router;
