import { pool, query } from '../db.js';
import { mails } from './mailer.js';

const REMIND_AFTER_H = 24;   // reminder email this long after signing up
const GRACE_H = 48;          // deleted this long after the reminder (24 + 48 = 72h for a new signup)
const LOCK_KEY = 72_000_024; // only one run at a time, even with several server instances

/**
 * Creators who signed up but never filled in the profile can't use the community.
 * 24h after signing up they get a reminder (with the deadline); 48h after the reminder the
 * unfinished account is deleted and they're told they're welcome to sign up again.
 * Accounts that were already old when this started get the reminder first, so nobody is
 * deleted without warning.
 */
export async function runSignupCleanup({ log = console.log } = {}) {
  const client = await pool.connect();
  try {
    const { rows: [{ locked }] } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [LOCK_KEY]);
    if (!locked) return { reminded: 0, expired: 0 };
    try {
      const { rows: toRemind } = await client.query(
        `UPDATE users u SET signup_reminded_at = now()
         WHERE u.role = 'creator' AND u.status = 'pending' AND u.signup_reminded_at IS NULL
           AND u.created_at < now() - make_interval(hours => $1)
           AND NOT EXISTS (SELECT 1 FROM creators c WHERE c.user_id = u.id)
         RETURNING u.email, u.signup_reminded_at + make_interval(hours => $2) AS deadline`,
        [REMIND_AFTER_H, GRACE_H],
      );
      for (const r of toRemind) await mails.signupReminder(r.email, r.deadline);

      const { rows: expired } = await client.query(
        `DELETE FROM users u
         WHERE u.role = 'creator' AND u.status = 'pending'
           AND u.signup_reminded_at < now() - make_interval(hours => $1)
           AND NOT EXISTS (SELECT 1 FROM creators c WHERE c.user_id = u.id)
         RETURNING u.email`,
        [GRACE_H],
      );
      for (const r of expired) await mails.signupExpired(r.email);
      if (expired.length) {
        await query(`INSERT INTO events (user_id, type, payload) VALUES (NULL, 'unfinished_signups_deleted', $1)`, [{ count: expired.length }]);
      }
      if (toRemind.length || expired.length) log(`signup cleanup: ${toRemind.length} reminded, ${expired.length} expired`);
      return { reminded: toRemind.length, expired: expired.length };
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

/** Runs now and then every 30 minutes. */
export function scheduleSignupCleanup() {
  const run = () => runSignupCleanup().catch((err) => console.error('signup cleanup failed:', err.message));
  setTimeout(run, 60_000).unref();
  setInterval(run, 30 * 60_000).unref();
}
