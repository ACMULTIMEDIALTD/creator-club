// Usage: npm run create-admin -- someone@example.com 'password'
import { pool } from '../db.js';
import { upsertAdmin } from '../seed.js';

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error('usage: npm run create-admin -- <email> <password (8+ chars)>');
  process.exit(1);
}
await upsertAdmin(email, password);
console.log(`admin ready: ${email}`);
await pool.end();
