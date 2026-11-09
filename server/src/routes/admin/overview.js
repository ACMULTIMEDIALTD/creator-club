import { Router } from 'express';
import { query } from '../../db.js';
import { DOMAIN_TYPOS, suggestEmail } from '../../lib/emailTypos.js';

const router = Router();

/** Admin "today" screen: open campaigns with counts + creators waiting for approval. */
router.get('/', async (_req, res) => {
  const [campaigns, pending, stats, typos] = await Promise.all([
    query(`SELECT c.id, c.slug, c.title, c.brand_display_name, c.type, c.status, c.slots, c.deadline_apply,
                  (SELECT count(*) FROM applications a WHERE a.campaign_id = c.id AND a.status = 'applied') AS applied_count,
                  (SELECT count(*) FROM applications a WHERE a.campaign_id = c.id AND a.status IN ('selected','completed')) AS selected_count
           FROM campaigns c WHERE c.status IN ('open','closed','in_progress')
           ORDER BY CASE c.status WHEN 'open' THEN 0 WHEN 'closed' THEN 1 ELSE 2 END, c.deadline_apply`),
    query(`SELECT u.id, u.email, u.phone, u.created_at, c.full_name, c.instagram_handle, c.instagram_followers,
                  c.tiktok_handle, c.tiktok_followers, c.user_id IS NOT NULL AS has_profile
           FROM users u LEFT JOIN creators c ON c.user_id = u.id
           WHERE u.role = 'creator' AND u.status = 'pending'
           ORDER BY (c.user_id IS NULL), u.created_at`),
    query(`SELECT
             count(*) FILTER (WHERE u.status = 'active') AS active,
             count(*) FILTER (WHERE u.status = 'pending' AND c.user_id IS NOT NULL) AS pending_complete,
             count(*) FILTER (WHERE u.status = 'pending' AND c.user_id IS NULL) AS pending_incomplete
           FROM users u LEFT JOIN creators c ON c.user_id = u.id WHERE u.role = 'creator'`),
    // Mistyped addresses (gnail.com…) never receive codes or emails; Noa fixes them in the creator card
    query(`SELECT u.id, u.email, c.full_name FROM users u LEFT JOIN creators c ON c.user_id = u.id
           WHERE u.role = 'creator' AND lower(split_part(u.email, '@', 2)) = ANY($1::text[])
           ORDER BY u.created_at`, [Object.keys(DOMAIN_TYPOS)]),
  ]);
  res.json({
    campaigns: campaigns.rows,
    pending: pending.rows,
    stats: stats.rows[0],
    email_typos: typos.rows.map((r) => ({ ...r, suggestion: suggestEmail(r.email) })),
  });
});

export default router;
