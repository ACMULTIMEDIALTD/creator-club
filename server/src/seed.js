import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { config } from './config.js';

export const NICHES = ['אופנה', 'יופי', 'אמהות', 'אוכל', 'לייפסטייל', 'כושר', 'בית', 'טיולים', 'טכנולוגיה', 'פיננסים', 'אחר'];
export const REGIONS = ['צפון', 'חיפה והקריות', 'השרון', 'מרכז', 'תל אביב', 'ירושלים', 'שפלה', 'דרום', 'אילת'];

/**
 * Creates Noa's admin account on first start. ADMIN_PASSWORD is only the initial password:
 * an existing account keeps the password she set, so a restart/deploy doesn't undo a change.
 */
export async function upsertAdmin(email, password) {
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, 'admin', 'active')
     ON CONFLICT (email) DO UPDATE SET role = 'admin', status = 'active',
       password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash)
     RETURNING id`,
    [email, hash],
  );
  return rows[0].id;
}

export async function seed({ log = console.log } = {}) {
  for (const [list, table] of [[NICHES, 'niches'], [REGIONS, 'regions']]) {
    for (const [i, name] of list.entries()) {
      await pool.query(
        `INSERT INTO ${table} (name, sort) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET sort = EXCLUDED.sort`,
        [name, i],
      );
    }
  }
  log(`seeded ${NICHES.length} niches, ${REGIONS.length} regions`);

  if (config.adminEmail && config.adminPassword) {
    await upsertAdmin(config.adminEmail, config.adminPassword);
    log(`admin ready: ${config.adminEmail}`);
  } else {
    log('ADMIN_EMAIL / ADMIN_PASSWORD not set — skipped admin user');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed()
    .then(() => pool.end())
    .catch((err) => { console.error(err); process.exit(1); });
}
