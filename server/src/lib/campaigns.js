import { pool } from '../db.js';
import { imageUrl } from './images.js';

/** Fields any logged-in creator may see. full_brief / payment_note / brand_id are NOT here (spec §3.2). */
export const PUBLIC_CAMPAIGN_FIELDS = [
  'slug', 'title', 'brand_display_name', 'short_description', 'type', 'product_value_ils',
  'min_followers', 'platforms', 'required_niche_ids', 'region_ids', 'slots',
  'deadline_apply', 'deadline_publish', 'status',
];

export function publicCampaign(c) {
  return { ...Object.fromEntries(PUBLIC_CAMPAIGN_FIELDS.map((f) => [f, c[f]])), image_url: imageUrl(c.image_id) };
}

export async function lookupNames(client = pool) {
  const [n, r] = await Promise.all([
    client.query('SELECT id, name FROM niches'),
    client.query('SELECT id, name FROM regions'),
  ]);
  return {
    niches: new Map(n.rows.map((x) => [x.id, x.name])),
    regions: new Map(r.rows.map((x) => [x.id, x.name])),
  };
}

/** Creator row + niche_ids, as needed by checkEligibility. */
export async function eligibilityCreator(userId, client = pool) {
  const { rows } = await client.query(
    `SELECT c.user_id, c.instagram_followers, c.tiktok_followers, c.region_id, c.terms_version,
            c.open_to_paid, c.open_to_barter, c.address_street, c.address_city,
            COALESCE((SELECT array_agg(niche_id) FROM creator_niches WHERE creator_id = c.user_id), '{}') AS niche_ids
     FROM creators c WHERE c.user_id = $1`,
    [userId],
  );
  return rows[0] || null;
}
