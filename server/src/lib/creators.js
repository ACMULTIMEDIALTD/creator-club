import { pool } from '../db.js';

export const ADMIN_ONLY_FIELDS = ['tier', 'admin_notes', 'internal_rating'];
// Rates are no longer collected or shown anywhere (columns kept in the DB, unused)
const RETIRED_FIELDS = ['rate_post_ils', 'rate_story_ils', 'rate_reel_ils'];

/** Full creator profile with niche ids and portfolio links. Strips admin-only fields unless asked. */
export async function getCreatorProfile(userId, { admin = false } = {}, client = pool) {
  const { rows } = await client.query(
    `SELECT c.*,
       COALESCE((SELECT array_agg(niche_id ORDER BY niche_id) FROM creator_niches WHERE creator_id = c.user_id), '{}') AS niche_ids,
       COALESCE((SELECT json_agg(json_build_object('id', id, 'url', url, 'label', label) ORDER BY sort)
                 FROM creator_links WHERE creator_id = c.user_id), '[]') AS links
     FROM creators c WHERE c.user_id = $1`,
    [userId],
  );
  const profile = rows[0];
  if (!profile) return null;
  for (const f of RETIRED_FIELDS) delete profile[f];
  if (!admin) for (const f of [...ADMIN_ONLY_FIELDS, 'terms_ip']) delete profile[f];
  return profile;
}
