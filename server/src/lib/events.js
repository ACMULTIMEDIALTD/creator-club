import { pool } from '../db.js';

/** Append to the audit log. Never throws — a logging failure must not break a request. */
export async function logEvent(userId, type, payload = null, client = pool) {
  try {
    await client.query('INSERT INTO events (user_id, type, payload) VALUES ($1, $2, $3)', [userId, type, payload]);
  } catch (err) {
    console.error('event log failed', type, err.message);
  }
}
