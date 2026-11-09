process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/creator_club_test';
process.env.CURRENT_TERMS_VERSION = '2026-10-v1';
process.env.APP_URL = 'http://app.test';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'admin-password';

const { default: request } = await import('supertest');
const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { seed } = await import('../src/seed.js');
const { createApp } = await import('../src/app.js');
const { outbox } = await import('../src/lib/mailer.js');
const { pushOutbox } = await import('../src/lib/push.js');

export { pool, outbox, pushOutbox };
export const app = createApp();

export async function resetDb() {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
  await seed({ log: () => {} });
  outbox.length = 0;
  pushOutbox.length = 0;
}

export const agent = () => request.agent(app);

export async function loginAdmin() {
  const a = agent();
  await a.post('/api/v1/auth/login').send({ email: 'admin@test.local', password: 'admin-password' }).expect(200);
  return a;
}

let n = 0;
export function profile(overrides = {}) {
  return {
    full_name: 'יוצרת בדיקה',
    city: 'תל אביב',
    region_id: 5,
    instagram_handle: '@tester',
    instagram_followers: 8000,
    tiktok_handle: '',
    niches: [1, 2],
    links: [{ url: 'https://instagram.com/p/abc', label: 'ריל' }],
    open_to_paid: true,
    open_to_barter: true,
    billing_status: 'osek_patur',
    address_street: 'הרצל 12',
    address_apt: 'דירה 4',
    address_city: 'תל אביב',
    address_zip: '6100000',
    address_confirmed: true,
    terms_accept: { version: '2026-10-v1' },
    ...overrides,
  };
}

/** Sign up + full profile. Optionally activate via admin. */
export async function makeCreator({ activate = true, admin, ...overrides } = {}) {
  n++;
  const a = agent();
  const email = `creator${n}@test.local`;
  const res = await a.post('/api/v1/auth/signup')
    .send({ email, phone: `05012345${String(n).padStart(2, '0')}`, password: 'password123' }).expect(201);
  await a.put('/api/v1/me/profile').send(profile(overrides)).expect(201);
  if (activate) {
    await admin.patch(`/api/v1/admin/creators/${res.body.user.id}`).send({ status: 'active' }).expect(200);
  }
  return { agent: a, id: res.body.user.id, email };
}

export function campaignBody(overrides = {}) {
  return {
    title: 'קמפיין קוסמטיקה',
    brand_display_name: 'מותג קוסמטיקה מוביל',
    short_description: 'מחפשות יוצרות לרילס על קרם פנים חדש',
    full_brief: 'BRIEF-SECRET',
    payment_note: 'PAY-SECRET ₪400',
    type: 'paid',
    min_followers: 5000,
    slots: 3,
    deadline_apply: new Date(Date.now() + 7 * 864e5).toISOString(),
    status: 'open',
    ...overrides,
  };
}
