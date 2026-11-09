import pg from 'pg';
import { config } from './config.js';

// Return int8 (counts) as JS numbers and dates as strings (no TZ surprises)
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

// An idle connection the database closes (restart, maintenance, network blip) is reported here.
// Without a listener Node treats it as an unhandled 'error' event and the whole server exits.
// The pool drops the broken client and opens a new one on the next query.
pool.on('error', (err) => {
  console.error('postgres idle client error (recovering):', err.message);
});

export const query = (text, params) => pool.query(text, params);

export async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
