import crypto from 'node:crypto';
import { query } from '../db.js';

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/**
 * New single-use sign-in link for a user; returns the raw token for the /m/<token> URL.
 * Older unused links/codes are burned, so only the latest email works.
 */
export async function issueMagicLink(userId, { ttlMin, codeHash = null }) {
  const token = crypto.randomBytes(32).toString('base64url');
  await query('UPDATE magic_links SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [userId]);
  await query(
    `INSERT INTO magic_links (token, user_id, expires_at, code_hash) VALUES ($1, $2, now() + make_interval(mins => $3), $4)`,
    [sha256(token), userId, ttlMin, codeHash],
  );
  return token;
}
