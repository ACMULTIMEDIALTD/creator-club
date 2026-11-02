-- Unfinished signups (no profile): a reminder email after 24h, deleted 48h after the reminder.
ALTER TABLE users ADD COLUMN signup_reminded_at timestamptz;

-- One time, when this ships: unfinished signups already older than 48h are treated as reminded
-- long ago, so the first cleanup run emails them that the registration expired and deletes them.
UPDATE users u SET signup_reminded_at = now() - interval '49 hours'
WHERE u.role = 'creator' AND u.status = 'pending'
  AND u.created_at < now() - interval '48 hours'
  AND NOT EXISTS (SELECT 1 FROM creators c WHERE c.user_id = u.id);
