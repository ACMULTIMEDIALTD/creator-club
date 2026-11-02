import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, outbox, pushOutbox, app, agent, resetDb, loginAdmin, makeCreator, campaignBody, profile } from './helpers.js';
import request from 'supertest';

let admin;
before(async () => { await resetDb(); admin = await loginAdmin(); });
after(() => pool.end());

test('only landing-type endpoints are public', async () => {
  const anon = agent();
  await anon.get('/api/v1/public/meta').expect(200);
  await anon.get('/api/v1/campaigns').expect(401);
  await anon.get('/api/v1/campaigns/whatever').expect(401);
  await anon.get('/api/v1/admin/creators').expect(401);
});

test('signup → profile requires terms → pending', async () => {
  const a = agent();
  const r = await a.post('/api/v1/auth/signup').send({ email: 'New@Test.local', phone: '+972 52-111-2233' }).expect(201);
  assert.equal(r.body.user.status, 'pending');
  assert.equal(r.body.user.phone, '0521112233');
  await agent().post('/api/v1/auth/signup').send({ email: 'new@test.local', phone: '0529999999' }).expect(409);

  const me = await a.get('/api/v1/auth/me').expect(200);
  assert.equal(me.body.needs_profile, true);
  assert.equal(me.body.whatsapp_group_url, null);

  const noTerms = profile(); delete noTerms.terms_accept;
  const bad = await a.put('/api/v1/me/profile').send(noTerms).expect(400);
  assert.equal(bad.body.error, 'terms_required');

  const noSocial = await a.put('/api/v1/me/profile').send(profile({ instagram_handle: '' })).expect(400);
  assert.ok(noSocial.body.fields.instagram_handle);

  const ok = await a.put('/api/v1/me/profile').send(profile({ instagram_handle: 'https://instagram.com/noa.test/' })).expect(201);
  assert.equal(ok.body.profile.instagram_handle, 'noa.test');
  assert.equal(ok.body.profile.terms_version, '2026-10-v1');
  assert.equal(ok.body.profile.tier, undefined, 'admin-only fields hidden from creator');
  assert.deepEqual(ok.body.profile.niche_ids, [1, 2]);

  // Admin got a notification, creator got a confirmation
  assert.ok(outbox.some((m) => m.to === 'admin@test.local'));
  assert.ok(outbox.some((m) => m.to === 'new@test.local'));

  // Pending creators don't see the board
  const board = await a.get('/api/v1/campaigns').expect(200);
  assert.equal(board.body.locked, true);
  // ...and can't reach admin
  await a.get('/api/v1/admin/creators').expect(403);
});

test('magic link login', async () => {
  const { email } = await makeCreator({ admin });
  outbox.length = 0;
  await agent().post('/api/v1/auth/login').send({ email: 'nobody@test.local' }).expect(200);
  assert.equal(outbox.length, 0);
  await agent().post('/api/v1/auth/login').send({ email, next: '/c/abc' }).expect(200);
  const link = outbox.at(-1).text.match(/http:\/\/app\.test(\S+)/)[1];
  assert.match(link, /^\/m\/[\w-]+\?next=%2Fc%2Fabc$/);
  const token = link.split('/')[2].split('?')[0];

  const a = agent();
  await a.post('/api/v1/auth/magic').send({ token }).expect(200);
  await a.get('/api/v1/auth/me').expect(200);
  // single use
  const again = await agent().post('/api/v1/auth/magic').send({ token }).expect(410);
  assert.equal(again.body.error, 'link_expired');

  // A plain GET (e.g. an email security scanner opening the link) can't use up a token
  await agent().post('/api/v1/auth/login').send({ email }).expect(200);
  const t2 = outbox.at(-1).text.match(/\/m\/([\w-]+)/)[1];
  await agent().get(`/api/v1/auth/magic/${t2}`).expect(404);
  await agent().post('/api/v1/auth/magic').send({ token: t2 }).expect(200);
});

test('campaign flow: eligibility, visibility, select, close', async () => {
  const big = await makeCreator({ admin, instagram_followers: 12000 });
  const small = await makeCreator({ admin, instagram_followers: 1000 });
  const barterOnly = await makeCreator({ admin, open_to_paid: false });
  const third = await makeCreator({ admin });

  const c = (await admin.post('/api/v1/admin/campaigns').send(campaignBody()).expect(201)).body.campaign;
  assert.equal(c.status, 'open');
  const draft = (await admin.post('/api/v1/admin/campaigns').send(campaignBody({ status: undefined, title: 'טיוטה' })).expect(201)).body.campaign;
  assert.equal(draft.status, 'draft');

  // Board never leaks brief/payment, and drafts are invisible
  const board = await big.agent.get('/api/v1/campaigns').expect(200);
  assert.equal(board.body.campaigns.length, 1);
  const card = board.body.campaigns[0];
  assert.equal(card.full_brief, undefined);
  assert.equal(card.payment_note, undefined);
  assert.equal(card.eligibility.ok, true);
  assert.ok(!JSON.stringify(board.body).includes('SECRET'));
  await big.agent.get(`/api/v1/campaigns/${draft.slug}`).expect(404);

  // Blocked reasons
  const s = await small.agent.get(`/api/v1/campaigns/${c.slug}`).expect(200);
  assert.equal(s.body.eligibility.reason, 'min_followers');
  assert.equal(s.body.eligibility.message, 'דרוש מינימום 5,000 עוקבים');
  const sa = await small.agent.post(`/api/v1/campaigns/${c.slug}/apply`).send({}).expect(422);
  assert.equal(sa.body.error, 'min_followers');
  const b = await barterOnly.agent.post(`/api/v1/campaigns/${c.slug}/apply`).send({}).expect(422);
  assert.equal(b.body.error, 'not_open_to_paid');

  // Apply, double apply, withdraw, re-apply
  await big.agent.post(`/api/v1/campaigns/${c.slug}/apply`).send({ message: 'x'.repeat(301) }).expect(400);
  await big.agent.post(`/api/v1/campaigns/${c.slug}/apply`).send({ message: 'מתאימה!' }).expect(201);
  const dup = await big.agent.post(`/api/v1/campaigns/${c.slug}/apply`).send({}).expect(422);
  assert.equal(dup.body.error, 'already_applied');
  await big.agent.delete(`/api/v1/campaigns/${c.slug}/apply`).expect(200);
  await big.agent.post(`/api/v1/campaigns/${c.slug}/apply`).send({ message: 'שוב' }).expect(201);
  await third.agent.post(`/api/v1/campaigns/${c.slug}/apply`).send({}).expect(201);

  // Admin applications table
  const apps = await admin.get(`/api/v1/admin/campaigns/${c.id}/applications`).expect(200);
  assert.equal(apps.body.applications.length, 2);
  assert.equal(apps.body.campaign.applied_count, 2);
  const bigApp = apps.body.applications.find((x) => x.creator_id === big.id);
  assert.equal(bigApp.message, 'שוב');

  // Not selected yet → still no brief
  let d = await big.agent.get(`/api/v1/campaigns/${c.slug}`).expect(200);
  assert.equal(d.body.campaign.full_brief, undefined);

  outbox.length = 0;
  await admin.post('/api/v1/admin/applications/bulk').send({ ids: [bigApp.id], status: 'selected' }).expect(200);
  assert.equal(outbox.filter((m) => m.to === big.email).length, 1);
  // selecting again doesn't re-email
  await admin.patch(`/api/v1/admin/applications/${bigApp.id}`).send({ status: 'selected', admin_note: 'מעולה' }).expect(200);
  assert.equal(outbox.filter((m) => m.to === big.email).length, 1);

  d = await big.agent.get(`/api/v1/campaigns/${c.slug}`).expect(200);
  assert.equal(d.body.selected, true);
  assert.equal(d.body.campaign.full_brief, 'BRIEF-SECRET');
  assert.equal(d.body.campaign.payment_note, 'PAY-SECRET ₪400');
  // ...but the list endpoint still never includes it
  const mine = await big.agent.get('/api/v1/me/applications').expect(200);
  assert.ok(!JSON.stringify(mine.body).includes('SECRET'));
  await big.agent.delete(`/api/v1/campaigns/${c.slug}/apply`).expect(409);

  // WhatsApp text + CSV
  const wa = await admin.get(`/api/v1/admin/campaigns/${c.id}/whatsapp-text`).expect(200);
  assert.match(wa.body.text, /^📣 קמפיין חדש: קמפיין קוסמטיקה\n/);
  assert.match(wa.body.text, /בתשלום · מינימום 5,000 עוקבים/);
  assert.match(wa.body.text, new RegExp(`👉 http://app.test/c/${c.slug}$`));
  assert.ok(!wa.body.text.includes('SECRET'));
  const csv = await admin.get(`/api/v1/admin/campaigns/${c.id}/export.csv`).expect(200);
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.equal(csv.text.trim().split('\r\n').length, 2);

  // Close → remaining applied become rejected
  const closed = await admin.patch(`/api/v1/admin/campaigns/${c.id}`).send({ status: 'closed' }).expect(200);
  assert.equal(closed.body.auto_rejected, 1);
  const t = await third.agent.get('/api/v1/me/applications').expect(200);
  assert.equal(t.body.applications[0].status, 'rejected');
  // closed campaign: still visible to applicants, gone for others
  await third.agent.get(`/api/v1/campaigns/${c.slug}`).expect(200);
  await small.agent.get(`/api/v1/campaigns/${c.slug}`).expect(404);
});

test('niche / region / barter rules', async () => {
  const north = await makeCreator({ admin, region_id: 1, niches: [3] });
  const c = (await admin.post('/api/v1/admin/campaigns')
    .send(campaignBody({ type: 'barter', min_followers: 0, region_ids: [5], required_niche_ids: [3] })).expect(201)).body.campaign;
  const r = await north.agent.get(`/api/v1/campaigns/${c.slug}`).expect(200);
  assert.equal(r.body.eligibility.reason, 'region');
  assert.match(r.body.eligibility.message, /תל אביב/);
  await admin.patch(`/api/v1/admin/campaigns/${c.id}`).send({ region_ids: [] }).expect(200);
  const r2 = await north.agent.get(`/api/v1/campaigns/${c.slug}`).expect(200);
  assert.equal(r2.body.eligibility.ok, true);
});

test('deadline passed blocks apply and hides from board', async () => {
  const cr = await makeCreator({ admin });
  const c = (await admin.post('/api/v1/admin/campaigns').send(campaignBody({ min_followers: 0 })).expect(201)).body.campaign;
  await pool.query(`UPDATE campaigns SET deadline_apply = now() - interval '1 minute' WHERE id = $1`, [c.id]);
  const res = await cr.agent.post(`/api/v1/campaigns/${c.slug}/apply`).send({}).expect(422);
  assert.equal(res.body.error, 'deadline_passed');
  const board = await cr.agent.get('/api/v1/campaigns').expect(200);
  assert.ok(!board.body.campaigns.some((x) => x.slug === c.slug));
});

test('terms re-accept when version changes', async () => {
  const cr = await makeCreator({ admin });
  await pool.query(`UPDATE creators SET terms_version = '2025-01-v0' WHERE user_id = $1`, [cr.id]);
  const me = await cr.agent.get('/api/v1/auth/me').expect(200);
  assert.equal(me.body.needs_terms, true);
  const c = (await admin.post('/api/v1/admin/campaigns').send(campaignBody({ min_followers: 0 })).expect(201)).body.campaign;
  assert.equal((await cr.agent.post(`/api/v1/campaigns/${c.slug}/apply`).send({}).expect(422)).body.error, 'terms_outdated');
  await cr.agent.post('/api/v1/me/terms').send({ version: 'old' }).expect(409);
  await cr.agent.post('/api/v1/me/terms').send({ version: '2026-10-v1' }).expect(200);
  assert.equal((await cr.agent.get('/api/v1/auth/me')).body.needs_terms, false);
  await cr.agent.post(`/api/v1/campaigns/${c.slug}/apply`).send({}).expect(201);
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM events WHERE user_id = $1 AND type = 'terms_accepted'`, [cr.id]);
  assert.equal(rows[0].n, 2);
});

test('admin creators: filters, patch, CSV, suspend', async () => {
  const a = await makeCreator({ admin, full_name: 'דנה פילטר', instagram_followers: 50000, niches: [4], region_id: 2 });
  let r = await admin.get('/api/v1/admin/creators?q=פילטר').expect(200);
  assert.equal(r.body.creators.length, 1);
  assert.deepEqual(r.body.creators[0].niches, ['אוכל']);
  r = await admin.get('/api/v1/admin/creators?niche=4&min_followers=40000&region=2&open_to=paid').expect(200);
  assert.deepEqual(r.body.creators.map((x) => x.id), [a.id]);
  r = await admin.get('/api/v1/admin/creators?status=pending').expect(200);
  assert.ok(r.body.creators.every((x) => x.status === 'pending'));

  await admin.patch(`/api/v1/admin/creators/${a.id}`).send({ tier: 'A', internal_rating: 5, admin_notes: 'מעולה' }).expect(200);
  r = await admin.get(`/api/v1/admin/creators/${a.id}`).expect(200);
  assert.equal(r.body.profile.tier, 'A');
  assert.ok(r.body.events.length > 0);
  await admin.patch(`/api/v1/admin/creators/${a.id}`).send({ internal_rating: 9 }).expect(400);

  const csv = await admin.get('/api/v1/admin/creators/export.csv?tier=A').expect(200);
  assert.ok(csv.text.startsWith('﻿'));
  assert.match(csv.text, /דנה פילטר/);

  await admin.patch(`/api/v1/admin/creators/${a.id}`).send({ status: 'suspended' }).expect(200);
  await a.agent.get('/api/v1/auth/me').expect(403);

  // Can't approve someone with no profile
  const bare = agent();
  const u = (await bare.post('/api/v1/auth/signup').send({ email: 'bare@test.local', phone: '0541231234' }).expect(201)).body.user;
  await admin.patch(`/api/v1/admin/creators/${u.id}`).send({ status: 'active' }).expect(400);
});

test('brands CRUD + campaign delete rules', async () => {
  const b = (await admin.post('/api/v1/admin/brands').send({ name: 'לוריאל', contact_email: 'x@y.com' }).expect(201)).body.brand;
  const c = (await admin.post('/api/v1/admin/campaigns').send(campaignBody({ brand_id: b.id })).expect(201)).body.campaign;
  await admin.delete(`/api/v1/admin/brands/${b.id}`).expect(409);
  await admin.delete(`/api/v1/admin/campaigns/${c.id}`).expect(409);
  await admin.patch(`/api/v1/admin/brands/${b.id}`).send({ notes: 'חתמו' }).expect(200);
  const list = await admin.get('/api/v1/admin/brands').expect(200);
  assert.equal(list.body.brands.find((x) => x.id === b.id).campaign_count, 1);
  await admin.post('/api/v1/admin/campaigns').send(campaignBody({ slug: c.slug })).expect(409);
});

test('brand inquiry emails Noa; honeypot is silently dropped', async () => {
  outbox.length = 0;
  const body = { name: 'רון', brand: 'מותג', phone: '0501112222', email: 'ron@brand.co.il', message: 'היי' };
  await agent().post('/api/v1/public/brand-inquiry').send({ ...body, website: 'spam' }).expect(200);
  assert.equal(outbox.length, 0);
  await agent().post('/api/v1/public/brand-inquiry').send(body).expect(200);
  assert.equal(outbox[0].to, 'admin@test.local');
});

test('native app: bearer token auth, push devices, push triggers', async () => {
  const { email, id } = await makeCreator({ admin, instagram_followers: 9000, niches: [2] });
  const other = await makeCreator({ admin, instagram_followers: 500 });

  // Browser login → no token in the body; app login → token
  const web = await agent().post('/api/v1/auth/login').send({ email, password: 'password123' }).expect(200);
  assert.equal(web.body.token, undefined);
  const login = await request(app).post('/api/v1/auth/login').set('X-Client', 'app')
    .send({ email, password: 'password123' }).expect(200);
  const token = login.body.token;
  assert.ok(token);

  const bearer = (m, url) => request(app)[m](url).set('Authorization', `Bearer ${token}`).set('X-Client', 'app');
  assert.equal((await bearer('get', '/api/v1/auth/me').expect(200)).body.user.id, id);
  await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer nope').expect(401);

  // CORS allows the Capacitor WebView origins
  const pre = await request(app).options('/api/v1/auth/me').set('Origin', 'capacitor://localhost').set('Access-Control-Request-Method', 'GET');
  assert.equal(pre.headers['access-control-allow-origin'], 'capacitor://localhost');

  // Register both creators' phones
  await bearer('post', '/api/v1/me/devices').send({ token: 'fcm-token-'.padEnd(40, 'a'), platform: 'ios' }).expect(200);
  await bearer('post', '/api/v1/me/devices').send({ token: 'x', platform: 'ios' }).expect(400);
  const otherLogin = await request(app).post('/api/v1/auth/login').set('X-Client', 'app').send({ email: other.email, password: 'password123' });
  await request(app).post('/api/v1/me/devices').set('Authorization', `Bearer ${otherLogin.body.token}`)
    .send({ token: 'fcm-other-'.padEnd(40, 'b'), platform: 'android' }).expect(200);

  // Opening a campaign pushes only to creators who are eligible
  pushOutbox.length = 0;
  const c = (await admin.post('/api/v1/admin/campaigns').send(campaignBody({ min_followers: 5000, required_niche_ids: [2] })).expect(201)).body.campaign;
  assert.equal(pushOutbox.length, 1);
  assert.deepEqual(pushOutbox[0].userIds, [id]);
  assert.equal(pushOutbox[0].url, `/c/${c.slug}`);

  // Draft → open via PATCH also pushes; editing an open campaign does not
  pushOutbox.length = 0;
  const d = (await admin.post('/api/v1/admin/campaigns').send(campaignBody({ status: undefined, min_followers: 0 })).expect(201)).body.campaign;
  assert.equal(pushOutbox.length, 0);
  await admin.patch(`/api/v1/admin/campaigns/${d.id}`).send({ status: 'open' }).expect(200);
  assert.equal(pushOutbox.length, 1);
  assert.equal(pushOutbox[0].userIds.length, 2);
  await admin.patch(`/api/v1/admin/campaigns/${d.id}`).send({ title: 'שם חדש' }).expect(200);
  assert.equal(pushOutbox.length, 1);

  // Selected → push to that creator
  await bearer('post', `/api/v1/campaigns/${c.slug}/apply`).send({}).expect(201);
  const apps = await admin.get(`/api/v1/admin/campaigns/${c.id}/applications`).expect(200);
  pushOutbox.length = 0;
  await admin.post('/api/v1/admin/applications/bulk').send({ ids: [apps.body.applications[0].id], status: 'selected' }).expect(200);
  assert.equal(pushOutbox.length, 1);
  assert.match(pushOutbox[0].title, /נבחרת/);

  // Logout with the push token unregisters the phone
  await bearer('post', '/api/v1/auth/logout').send({ push_token: 'fcm-token-'.padEnd(40, 'a') }).expect(200);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM push_devices WHERE user_id = $1', [id]);
  assert.equal(rows[0].n, 0);
});

test('server survives the database dropping idle connections', async () => {
  // Warm the pool, then kill every connection from the database side (what a DB restart does)
  await Promise.all([1, 2, 3].map(() => pool.query('SELECT 1')));
  await pool.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity
                    WHERE datname = current_database() AND pid <> pg_backend_pid()`).catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
  // Still alive and the pool reconnects
  await agent().get('/api/v1/public/meta').expect(200);
});

test('without email configured: password required, sign-in links off', async () => {
  const { config } = await import('../src/config.js');
  config.mailEnabled = false;
  try {
    const meta = await agent().get('/api/v1/public/meta').expect(200);
    assert.equal(meta.body.mail_enabled, false);
    const r = await agent().post('/api/v1/auth/signup').send({ email: 'nopass@test.local', phone: '0549990000' }).expect(400);
    assert.ok(r.body.fields.password);
    await agent().post('/api/v1/auth/signup').send({ email: 'nopass@test.local', phone: '0549990000', password: 'password123' }).expect(201);
    const m = await agent().post('/api/v1/auth/login').send({ email: 'nopass@test.local' }).expect(400);
    assert.equal(m.body.error, 'mail_disabled');
    await agent().post('/api/v1/auth/login').send({ email: 'nopass@test.local', password: 'password123' }).expect(200);
  } finally {
    config.mailEnabled = true;
  }
});

test('admin resets a creator password', async () => {
  const c = await makeCreator({ admin });
  const r = await admin.post(`/api/v1/admin/creators/${c.id}/reset-password`).expect(200);
  assert.match(r.body.password, /^[a-z2-9]{10}$/);
  await agent().post('/api/v1/auth/login').send({ email: c.email, password: 'password123' }).expect(401);
  await agent().post('/api/v1/auth/login').send({ email: c.email, password: r.body.password }).expect(200);
  // The reset signs her out everywhere (an old session/token stops working)
  await c.agent.get('/api/v1/auth/me').expect(401);
});

test('campaign images: upload, signed URL, members only', async () => {
  // 1x1 JPEG
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
  const creator = await makeCreator({ admin });

  // Only real images, only admins
  await admin.post('/api/v1/admin/images').set('Content-Type', 'image/jpeg').send(Buffer.from('not an image')).expect(400);
  await creator.agent.post('/api/v1/admin/images').set('Content-Type', 'image/jpeg').send(jpeg).expect(403);
  const up = await admin.post('/api/v1/admin/images').set('Content-Type', 'image/jpeg').send(jpeg).expect(201);
  assert.ok(up.body.id);

  const c = (await admin.post('/api/v1/admin/campaigns').send(campaignBody({ min_followers: 0, image_id: up.body.id })).expect(201)).body.campaign;
  assert.match(c.image_url, /^\/api\/v1\/images\/[0-9a-f-]+\?exp=\d+&sig=/);

  // Creators get a signed URL on the board and the campaign page
  const board = await creator.agent.get('/api/v1/campaigns').expect(200);
  const url = board.body.campaigns.find((x) => x.slug === c.slug).image_url;
  assert.ok(url);
  const detail = await creator.agent.get(`/api/v1/campaigns/${c.slug}`).expect(200);
  assert.ok(detail.body.campaign.image_url);

  // The signed URL works without a session; tampering or expiry is refused
  const img = await agent().get(url).expect(200);
  assert.equal(img.headers['content-type'], 'image/jpeg');
  assert.equal(img.body.length, jpeg.length);
  await agent().get(url.replace(/sig=[^&]+/, 'sig=AAAA')).expect(403);
  await agent().get(url.replace(/exp=\d+/, 'exp=1')).expect(403);
  await agent().get(`/api/v1/images/${up.body.id}`).expect(403);

  // Removing the image from the campaign
  const patched = await admin.patch(`/api/v1/admin/campaigns/${c.id}`).send({ image_id: null }).expect(200);
  assert.equal(patched.body.campaign.image_url, null);
});

test('rates are gone from the profile, admin views and CSV', async () => {
  const c = await makeCreator({ admin });
  const me = await c.agent.get('/api/v1/me/profile').expect(200);
  assert.ok(!Object.keys(me.body.profile).some((k) => k.startsWith('rate_')));
  const a = await admin.get(`/api/v1/admin/creators/${c.id}`).expect(200);
  assert.ok(!Object.keys(a.body.profile).some((k) => k.startsWith('rate_')));
  const list = await admin.get('/api/v1/admin/creators').expect(200);
  assert.ok(!Object.keys(list.body.creators[0]).some((k) => k.startsWith('rate_')));
  const csv = await admin.get('/api/v1/admin/creators/export.csv').expect(200);
  assert.ok(!csv.text.includes('תעריף'));
});

test('two exports: with names for Noa, anonymous for brands', async () => {
  const a = await makeCreator({ admin, full_name: 'שירה אנונימית', instagram_handle: 'shira.anon', city: 'רעננה', instagram_followers: 77000, niches: [2], birth_year: 1995 });
  await makeCreator({ activate: false, admin, full_name: 'ממתינה לאישור' });
  const code = `C-${a.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;

  const noa = await admin.get('/api/v1/admin/creators/export.csv').expect(200);
  assert.match(noa.text, /שירה אנונימית/);
  assert.ok(noa.text.includes(code));

  const brands = await admin.get('/api/v1/admin/creators/export-brands.csv?niche=2').expect(200);
  assert.ok(brands.text.includes(code));
  assert.ok(brands.text.includes('77000'));
  for (const secret of ['שירה אנונימית', 'shira.anon', 'רעננה', a.email, 'ממתינה לאישור', '@']) {
    assert.ok(!brands.text.includes(secret), `brand file must not contain ${secret}`);
  }
  const header = brands.text.replace(/^\uFEFF/, '').split('\r\n')[0].split(',');
  for (const col of ['שם', 'טלפון', 'מייל', 'עיר', 'אינסטגרם', 'טיקטוק', 'יוטיוב']) {
    assert.ok(!header.includes(col), `brand file must not have a "${col}" column`);
  }

  // Noa can find the creator by the code a brand sends back
  const found = await admin.get(`/api/v1/admin/creators?q=${code}`).expect(200);
  assert.deepEqual(found.body.creators.map((x) => x.id), [a.id]);
});

test('terms acceptance records that the terms were read to the end', async () => {
  const c = await makeCreator({ admin, terms_accept: { version: '2026-10-v1', read_to_end: true } });
  const { rows } = await pool.query(
    `SELECT payload FROM events WHERE user_id = $1 AND type = 'terms_accepted' ORDER BY id DESC LIMIT 1`, [c.id]);
  assert.equal(rows[0].payload.read_to_end, true);
  assert.equal(rows[0].payload.version, '2026-10-v1');
});

test('sign-in link request works when the page sends next: null', async () => {
  const { email } = await makeCreator({ admin });
  outbox.length = 0;
  await agent().post('/api/v1/auth/login').send({ email, next: null }).expect(200);
  assert.equal(outbox.length, 1);
  assert.match(outbox[0].text, /\/m\/[\w-]+$/m);
  // branded HTML email: logo, button and footer links
  assert.match(outbox[0].html, /logo-512\.jpg/);
  assert.match(outbox[0].html, /כניסה לקהילה/);
  assert.match(outbox[0].html, /\/accessibility/);
});

test('emails carry a Reply-To: Noa for creators, the brand for brand inquiries', async () => {
  const { email } = await makeCreator({ admin });
  outbox.length = 0;
  await agent().post('/api/v1/auth/login').send({ email }).expect(200);
  assert.equal(outbox[0].replyTo, 'admin@test.local');
  outbox.length = 0;
  await agent().post('/api/v1/public/brand-inquiry')
    .send({ name: 'רון', brand: 'מותג', phone: '0501112222', email: 'ron@brand.co.il', message: '' }).expect(200);
  assert.equal(outbox[0].replyTo, 'ron@brand.co.il');
});

test('login code: sign in by typing the 6-digit code from the email', async () => {
  const { email } = await makeCreator({ admin });
  outbox.length = 0;
  await agent().post('/api/v1/auth/login').send({ email }).expect(200);
  const code = outbox[0].text.match(/קוד הכניסה שלך: (\d{6})/)[1];
  assert.match(outbox[0].subject, new RegExp(code));
  assert.ok(outbox[0].html.includes(code));

  // wrong code → 401, right code → session (and the app gets a token)
  await agent().post('/api/v1/auth/code').send({ email, code: code === '000000' ? '111111' : '000000' }).expect(401);
  const a = agent();
  const ok = await a.post('/api/v1/auth/code').set('X-Client', 'app').send({ email, code }).expect(200);
  assert.ok(ok.body.token);
  await a.get('/api/v1/auth/me').expect(200);
  // single use
  await agent().post('/api/v1/auth/code').send({ email, code }).expect(401);

  // a newer request replaces the old code; 5 wrong guesses burn the code
  outbox.length = 0;
  await agent().post('/api/v1/auth/login').send({ email }).expect(200);
  const code2 = outbox[0].text.match(/קוד הכניסה שלך: (\d{6})/)[1];
  const wrong = code2 === '999999' ? '888888' : '999999';
  for (let i = 0; i < 5; i++) await agent().post('/api/v1/auth/code').send({ email, code: wrong }).expect(401);
  await agent().post('/api/v1/auth/code').send({ email, code: code2 }).expect(401);

  // unknown email looks the same as a wrong code
  const unknown = await agent().post('/api/v1/auth/code').send({ email: 'nobody@test.local', code: '123456' }).expect(401);
  assert.equal(unknown.body.error, 'invalid_code');
});

test('forgot password: code sign-in sets a new password; otherwise the current one is needed', async () => {
  const { email, agent: a } = await makeCreator({ admin });

  // password session: must give the current password
  const me = await a.get('/api/v1/auth/me').expect(200);
  assert.equal(me.body.has_password, true);
  assert.equal(me.body.can_reset_password, false);
  const no = await a.post('/api/v1/auth/password').send({ password: 'newpass456' }).expect(400);
  assert.equal(no.body.error, 'invalid_current_password');
  await a.post('/api/v1/auth/password').send({ password: 'newpass456', current_password: 'wrong' }).expect(400);
  await a.post('/api/v1/auth/password').send({ password: 'short', current_password: 'password123' }).expect(400);
  await a.post('/api/v1/auth/password').send({ password: 'newpass456', current_password: 'password123' }).expect(200);
  await agent().post('/api/v1/auth/login').send({ email, password: 'password123' }).expect(401);
  await agent().post('/api/v1/auth/login').send({ email, password: 'newpass456' }).expect(200);

  // forgot it: sign in with the emailed code, then set a new one without the old
  outbox.length = 0;
  await agent().post('/api/v1/auth/login').send({ email }).expect(200);
  const code = outbox[0].text.match(/קוד הכניסה שלך: (\d{6})/)[1];
  const b = agent();
  await b.post('/api/v1/auth/code').send({ email, code }).expect(200);
  assert.equal((await b.get('/api/v1/auth/me').expect(200)).body.can_reset_password, true);
  await b.post('/api/v1/auth/password').send({ password: 'fresh789xyz' }).expect(200);
  await agent().post('/api/v1/auth/login').send({ email, password: 'fresh789xyz' }).expect(200);

  // logged out → 401
  await agent().post('/api/v1/auth/password').send({ password: 'whatever123' }).expect(401);
});

test('payments: approve video → invoice upload with bank details → Noa marks paid', async () => {
  const cr = await makeCreator({ admin });
  const other = await makeCreator({ admin });
  const c = (await admin.post('/api/v1/admin/campaigns').send(campaignBody({ title: 'קמפיין תשלום' })).expect(201)).body.campaign;
  const appId = (await cr.agent.post(`/api/v1/campaigns/${c.slug}/apply`).send({}).expect(201)).body.application.id;
  await admin.patch(`/api/v1/admin/applications/${appId}`).send({ status: 'selected' }).expect(200);

  const pdf = Buffer.from('%PDF-1.4\n% test invoice\n');
  const bank = { account_holder: 'דנה כהן', bank_name: 'לאומי', branch: '812', account_number: '123456' };
  const details = { doc_type: 'receipt', amount_ils: 450, ...bank };

  // Not before the video is approved
  const early = await cr.agent.get(`/api/v1/campaigns/${c.slug}`).expect(200);
  assert.equal(early.body.payment, null);
  const f0 = (await cr.agent.post('/api/v1/me/invoice-files').set('Content-Type', 'application/pdf').send(pdf).expect(201)).body.id;
  await cr.agent.put(`/api/v1/me/applications/${appId}/invoice`).send({ ...details, file_id: f0 }).expect(409);

  // Noa approves the video → email asking for the invoice
  outbox.length = 0;
  await admin.post('/api/v1/admin/applications/bulk').send({ ids: [appId], status: 'completed' }).expect(200);
  assert.equal(outbox.length, 1);
  assert.match(outbox[0].subject, /הסרטון אושר/);
  assert.ok(outbox[0].text.includes(`/c/${c.slug}`));

  const page = await cr.agent.get(`/api/v1/campaigns/${c.slug}`).expect(200);
  assert.deepEqual(page.body.payment, { paid_at: null, invoice: null, saved_bank: null });

  // Only real PDFs/images; the file and the details are both required
  await cr.agent.post('/api/v1/me/invoice-files').set('Content-Type', 'application/pdf').send(Buffer.from('<html>')).expect(400);
  const missing = await cr.agent.put(`/api/v1/me/applications/${appId}/invoice`).send(details).expect(400);
  assert.ok(missing.body.fields.file);
  const bad = await cr.agent.put(`/api/v1/me/applications/${appId}/invoice`).send({ ...details, file_id: f0, branch: 'abc' }).expect(400);
  assert.ok(bad.body.fields.branch);
  // Another creator can't use her application or her file
  await other.agent.put(`/api/v1/me/applications/${appId}/invoice`).send({ ...details, file_id: f0 }).expect(404);

  // One-time: bank details are NOT saved to the profile
  outbox.length = 0;
  await cr.agent.put(`/api/v1/me/applications/${appId}/invoice`).send({ ...details, file_id: f0 }).expect(200);
  assert.equal(outbox.length, 1); // Noa is told
  assert.match(outbox[0].subject, /חשבונית חדשה/);
  let pay = (await cr.agent.get(`/api/v1/campaigns/${c.slug}`).expect(200)).body.payment;
  assert.equal(pay.saved_bank, null);
  assert.equal(pay.invoice.amount_ils, 450);
  assert.equal(pay.invoice.account_number, '123456');
  // The signed link serves the file; a tampered one doesn't
  const file = await agent().get(pay.invoice.file_url).expect(200);
  assert.equal(file.headers['content-type'], 'application/pdf');
  await agent().get(pay.invoice.file_url.replace(/sig=./, 'sig=x')).expect(403);

  // Replace with "save to my profile" → prefilled next time; can be deleted
  const f1 = (await cr.agent.post('/api/v1/me/invoice-files?name=inv.pdf').set('Content-Type', 'application/pdf').send(pdf).expect(201)).body.id;
  outbox.length = 0;
  await cr.agent.put(`/api/v1/me/applications/${appId}/invoice`).send({ ...details, amount_ils: 500, file_id: f1, save_bank: true }).expect(200);
  assert.equal(outbox.length, 0); // replacing doesn't email Noa again
  pay = (await cr.agent.get(`/api/v1/campaigns/${c.slug}`).expect(200)).body.payment;
  assert.deepEqual(pay.saved_bank, bank);
  assert.equal(pay.invoice.file_name, 'inv.pdf');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM invoice_files WHERE id = $1', [f0])).rows[0].n, 0);

  // Noa sees it in payments and on the campaign
  const list = (await admin.get('/api/v1/admin/payments').expect(200)).body.payments;
  const p = list.find((x) => x.id === appId);
  assert.equal(p.invoice.amount_ils, 500);
  assert.equal(p.paid_at, null);
  const apps = (await admin.get(`/api/v1/admin/campaigns/${c.id}/applications`).expect(200)).body.applications;
  assert.equal(apps.find((a) => a.id === appId).invoice.bank_name, 'לאומי');
  // creators can't see the payments list
  await cr.agent.get('/api/v1/admin/payments').expect(403);

  // Mark paid → email; then the invoice is locked
  outbox.length = 0;
  await admin.post(`/api/v1/admin/applications/${appId}/paid`).send({ paid: true }).expect(200);
  assert.equal(outbox.length, 1);
  assert.match(outbox[0].subject, /הועבר/);
  assert.ok(outbox[0].text.includes('₪500'));
  await cr.agent.put(`/api/v1/me/applications/${appId}/invoice`).send(details).expect(409);
  const mine = (await cr.agent.get('/api/v1/me/applications').expect(200)).body.applications.find((a) => a.id === appId);
  assert.ok(mine.paid_at);
  assert.equal(mine.has_invoice, true);

  await cr.agent.delete('/api/v1/me/bank').expect(200);
  assert.equal((await cr.agent.get(`/api/v1/campaigns/${c.slug}`).expect(200)).body.payment.saved_bank, null);
});

test('payments: barter campaigns need no invoice', async () => {
  const cr = await makeCreator({ admin });
  const c = (await admin.post('/api/v1/admin/campaigns').send(campaignBody({ title: 'בארטר', type: 'barter' })).expect(201)).body.campaign;
  const appId = (await cr.agent.post(`/api/v1/campaigns/${c.slug}/apply`).send({}).expect(201)).body.application.id;
  outbox.length = 0;
  await admin.patch(`/api/v1/admin/applications/${appId}`).send({ status: 'completed' }).expect(200);
  assert.equal(outbox.length, 0);
  assert.equal((await cr.agent.get(`/api/v1/campaigns/${c.slug}`).expect(200)).body.payment, null);
  await admin.post(`/api/v1/admin/applications/${appId}/paid`).send({ paid: true }).expect(409);
  assert.ok(!(await admin.get('/api/v1/admin/payments').expect(200)).body.payments.some((x) => x.id === appId));
});

test('home address: required when open to barter, gates product campaigns, confirmed per campaign', async () => {
  // Open to barter → address + confirmation required
  const a = agent();
  await a.post('/api/v1/auth/signup').send({ email: 'addr@test.local', phone: '0539998877', password: 'password123' }).expect(201);
  const noAddr = { address_street: '', address_apt: '', address_city: '', address_zip: '', address_confirmed: false };
  let r = await a.put('/api/v1/me/profile').send(profile(noAddr)).expect(400);
  assert.ok(r.body.fields.address_street);
  r = await a.put('/api/v1/me/profile').send(profile({ address_confirmed: false })).expect(400);
  assert.ok(r.body.fields.address_confirmed);
  await a.put('/api/v1/me/profile').send(profile({ address_zip: '12' })).expect(400);
  // Paid only → address optional
  await a.put('/api/v1/me/profile').send(profile({ ...noAddr, open_to_barter: false })).expect(201);

  const me = (await a.get('/api/v1/auth/me').expect(200)).body.user;
  await admin.patch(`/api/v1/admin/creators/${me.id}`).send({ status: 'active' }).expect(200);
  const hybrid = (await admin.post('/api/v1/admin/campaigns').send(campaignBody({ title: 'משולב', type: 'hybrid' })).expect(201)).body.campaign;

  // No address → can't apply to a campaign that ships a product
  const page = (await a.get(`/api/v1/campaigns/${hybrid.slug}`).expect(200)).body;
  assert.equal(page.eligibility.reason, 'missing_address');
  await a.post(`/api/v1/campaigns/${hybrid.slug}/apply`).send({}).expect(422);

  await a.put('/api/v1/me/profile').send(profile({ open_to_barter: false })).expect(200);
  const prof = (await a.get('/api/v1/me/profile').expect(200)).body.profile;
  assert.equal(prof.address_city, 'תל אביב');
  assert.ok(prof.address_confirmed_at);
  const appId = (await a.post(`/api/v1/campaigns/${hybrid.slug}/apply`).send({}).expect(201)).body.application.id;
  assert.equal((await a.get(`/api/v1/campaigns/${hybrid.slug}`).expect(200)).body.shipping, null);

  // Selected → email mentions the address; page asks to confirm it
  outbox.length = 0;
  await admin.patch(`/api/v1/admin/applications/${appId}`).send({ status: 'selected' }).expect(200);
  assert.ok(outbox[0].text.includes('כתובת המשלוח'));
  let ship = (await a.get(`/api/v1/campaigns/${hybrid.slug}`).expect(200)).body.shipping;
  assert.equal(ship.confirmed_at, null);
  assert.equal(ship.address.address_street, 'הרצל 12');

  // She corrects it → profile updated, snapshot on the application, Noa sees it in the export
  const fixed = { address_street: 'ביאליק 7', address_apt: '', address_city: 'רמת גן', address_zip: '' };
  await a.put(`/api/v1/me/applications/${appId}/address`).send({ ...fixed, address_city: '' }).expect(400);
  await a.put(`/api/v1/me/applications/${appId}/address`).send(fixed).expect(200);
  ship = (await a.get(`/api/v1/campaigns/${hybrid.slug}`).expect(200)).body.shipping;
  assert.ok(ship.confirmed_at);
  assert.equal(ship.shipping_address, 'ביאליק 7, רמת גן');
  assert.equal((await a.get('/api/v1/me/profile').expect(200)).body.profile.address_city, 'רמת גן');
  const apps = (await admin.get(`/api/v1/admin/campaigns/${hybrid.id}/applications`).expect(200)).body.applications;
  assert.ok(apps.find((x) => x.id === appId).address_confirmed_at);
  const csv = await admin.get(`/api/v1/admin/campaigns/${hybrid.id}/export.csv`).expect(200);
  assert.ok(csv.text.includes('ביאליק 7, רמת גן'));
  // The anonymous file for brands never has it
  const brands = await admin.get('/api/v1/admin/creators/export-brands.csv').expect(200);
  assert.ok(!brands.text.includes('ביאליק'));

  // Paid-only campaign: nothing to ship
  const paid = (await admin.post('/api/v1/admin/campaigns').send(campaignBody({ title: 'רק תשלום' })).expect(201)).body.campaign;
  const paidApp = (await a.post(`/api/v1/campaigns/${paid.slug}/apply`).send({}).expect(201)).body.application.id;
  await admin.patch(`/api/v1/admin/applications/${paidApp}`).send({ status: 'selected' }).expect(200);
  await a.put(`/api/v1/me/applications/${paidApp}/address`).send(fixed).expect(409);
});

test('account deletion: removes her data, keeps invoices in the payment archive, tells Noa', async () => {
  const cr = await makeCreator({ admin });
  const c = (await admin.post('/api/v1/admin/campaigns').send(campaignBody({ title: 'לפני מחיקה' })).expect(201)).body.campaign;
  const appId = (await cr.agent.post(`/api/v1/campaigns/${c.slug}/apply`).send({}).expect(201)).body.application.id;
  await admin.patch(`/api/v1/admin/applications/${appId}`).send({ status: 'completed' }).expect(200);
  const fileId = (await cr.agent.post('/api/v1/me/invoice-files?name=kabala.pdf').set('Content-Type', 'application/pdf')
    .send(Buffer.from('%PDF-1.4 archived')).expect(201)).body.id;
  await cr.agent.put(`/api/v1/me/applications/${appId}/invoice`).send({
    file_id: fileId, doc_type: 'receipt', amount_ils: 300, account_holder: 'מחוקה', bank_name: 'לאומי', branch: '1', account_number: '999',
  }).expect(200);

  // Needs the typed confirmation; admins can't use it
  await cr.agent.delete('/api/v1/me/account').send({ confirm: 'כן', acknowledge_terms: true }).expect(400);
  // …and the acknowledgement that the terms still apply
  const ack = await cr.agent.delete('/api/v1/me/account').send({ confirm: 'מחיקה' }).expect(400);
  assert.ok(ack.body.fields.acknowledge_terms);
  await admin.delete('/api/v1/me/account').send({ confirm: 'מחיקה', acknowledge_terms: true }).expect(403);

  outbox.length = 0;
  await cr.agent.delete('/api/v1/me/account').send({ confirm: 'מחיקה', acknowledge_terms: true }).expect(200);
  await cr.agent.get('/api/v1/auth/me').expect(401); // signed out
  assert.equal(outbox.length, 1);
  assert.match(outbox[0].subject, /מחקה את החשבון/);
  assert.ok(outbox[0].text.includes('1 חשבוניות'));
  assert.ok(outbox[0].text.includes('עוד לא שולמו'));

  const left = await pool.query(
    `SELECT (SELECT count(*) FROM users WHERE id = $1)::int AS users, (SELECT count(*) FROM creators WHERE user_id = $1)::int AS creators,
            (SELECT count(*) FROM applications WHERE id = $2)::int AS apps, (SELECT count(*) FROM events WHERE user_id = $1)::int AS events`,
    [cr.id, appId],
  );
  assert.deepEqual(left.rows[0], { users: 0, creators: 0, apps: 0, events: 0 });
  // The record of the accepted terms stays (non-circumvention / confidentiality outlive the account)
  const rec = (await pool.query('SELECT * FROM deleted_accounts WHERE email = $1', [cr.email])).rows[0];
  assert.equal(rec.terms_version, '2026-10-v1');
  assert.ok(rec.terms_accepted_at);
  assert.equal(rec.full_name, 'יוצרת בדיקה');
  assert.ok(outbox[0].text.includes('מחקה את החשבון'));
  // Can sign up again with the same email
  await agent().post('/api/v1/auth/signup').send({ email: cr.email, phone: '0547770000', password: 'password123' }).expect(201);

  // The invoice is in Noa's archive, and its file still opens
  const { archive, payments } = (await admin.get('/api/v1/admin/payments').expect(200)).body;
  assert.ok(!payments.some((p) => p.id === appId));
  const arc = archive.find((x) => x.campaign_title === 'לפני מחיקה');
  assert.equal(arc.amount_ils, 300);
  assert.equal(arc.paid_at, null);
  const file = await agent().get(arc.file_url).expect(200);
  assert.equal(file.headers['content-type'], 'application/pdf');
  await agent().get(arc.file_url.replace('/archive/', '/invoice/')).expect(403);
});

test('security: password change ends other sessions, admin password survives restarts, client-ip', async () => {
  const c = await makeCreator({ admin });
  const other = agent(); // a second phone
  await other.post('/api/v1/auth/login').send({ email: c.email, password: 'password123' }).expect(200);
  const app = await agent().post('/api/v1/auth/login').set('X-Client', 'app').send({ email: c.email, password: 'password123' }).expect(200);

  const r = await c.agent.post('/api/v1/auth/password').send({ password: 'brand-new-pass1', current_password: 'password123' }).expect(200);
  await c.agent.get('/api/v1/auth/me').expect(200); // this device stays signed in
  await other.get('/api/v1/auth/me').expect(401);
  await agent().get('/api/v1/auth/me').set('Authorization', `Bearer ${app.body.token}`).expect(401);
  // the app gets a fresh token back with the change
  const fresh = await agent().post('/api/v1/auth/password').set('X-Client', 'app')
    .set('Authorization', `Bearer ${(await agent().post('/api/v1/auth/login').set('X-Client', 'app').send({ email: c.email, password: 'brand-new-pass1' })).body.token}`)
    .send({ password: 'brand-new-pass2', current_password: 'brand-new-pass1' }).expect(200);
  await agent().get('/api/v1/auth/me').set('Authorization', `Bearer ${fresh.body.token}`).expect(200);
  assert.ok(r.body.ok);

  // A token signed with another algorithm/secret is ignored
  await agent().get('/api/v1/auth/me').set('Authorization', 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.').expect(401);

  // Re-running the seed (every deploy) keeps the password Noa set
  const { seed } = await import('../src/seed.js');
  await admin.post('/api/v1/auth/password').send({ password: 'noa-own-password', current_password: 'admin-password' }).expect(200);
  await seed({ log: () => {} });
  await agent().post('/api/v1/auth/login').send({ email: 'admin@test.local', password: 'admin-password' }).expect(401);
  await agent().post('/api/v1/auth/login').send({ email: 'admin@test.local', password: 'noa-own-password' }).expect(200);

  const ip = await agent().get('/api/v1/public/client-ip').expect(200);
  assert.ok(ip.body.ip);
});

test('visitor IP: from Vercel / Cloudflare headers, not the proxy in front', async () => {
  // Website: Vercel's proxy passes the visitor in x-vercel-forwarded-for; Cloudflare saw Vercel
  const web = await agent().get('/api/v1/public/client-ip')
    .set('x-vercel-forwarded-for', '203.0.113.7').set('cf-connecting-ip', '18.208.245.124')
    .set('x-forwarded-for', '203.0.113.7,18.208.245.124, 104.22.104.139').expect(200);
  assert.equal(web.body.ip, '203.0.113.7');
  // App: straight to Render through Cloudflare
  const app = await agent().get('/api/v1/public/client-ip')
    .set('cf-connecting-ip', '198.51.100.9').set('x-forwarded-for', '198.51.100.9, 172.71.148.170').expect(200);
  assert.equal(app.body.ip, '198.51.100.9');
  // Garbage is ignored
  const junk = await agent().get('/api/v1/public/client-ip').set('x-vercel-forwarded-for', 'not-an-ip').set('cf-connecting-ip', '198.51.100.10').expect(200);
  assert.equal(junk.body.ip, '198.51.100.10');

  // The IP stored with the terms is the visitor's
  const a = agent();
  await a.post('/api/v1/auth/signup').send({ email: 'ipcheck@test.local', phone: '0526667788', password: 'password123' }).expect(201);
  await a.put('/api/v1/me/profile').set('x-vercel-forwarded-for', '203.0.113.42').send(profile()).expect(201);
  const me = (await a.get('/api/v1/auth/me').expect(200)).body.user;
  const { rows: [row] } = await pool.query('SELECT terms_ip FROM creators WHERE user_id = $1', [me.id]);
  assert.equal(row.terms_ip, '203.0.113.42');
});

test('email typos: signup suggests the fix, Noa sees and corrects them', async () => {
  const bad = await agent().post('/api/v1/auth/signup').send({ email: 'narkis@gnail.com', phone: '0521110000', password: 'password123' }).expect(400);
  assert.equal(bad.body.suggestion, 'narkis@gmail.com');
  assert.match(bad.body.fields.email, /gmail\.com/);

  // Someone who signed up before this check (simulated)
  const c = await makeCreator({ admin: await loginAdmin2() });
  await pool.query("UPDATE users SET email = 'typo.person@gnail.com' WHERE id = $1", [c.id]);
  const noa = await loginAdmin2();
  const ov = (await noa.get('/api/v1/admin/overview').expect(200)).body;
  const t = ov.email_typos.find((x) => x.id === c.id);
  assert.equal(t.suggestion, 'typo.person@gmail.com');

  // Taken address → 409; invalid → 400; fix → she can sign in with the right address
  await noa.patch(`/api/v1/admin/creators/${c.id}`).send({ email: 'admin@test.local' }).expect(409);
  await noa.patch(`/api/v1/admin/creators/${c.id}`).send({ email: 'nope' }).expect(400);
  const r = await noa.patch(`/api/v1/admin/creators/${c.id}`).send({ email: 'Typo.Person@gmail.com' }).expect(200);
  assert.equal(r.body.creator.email, 'typo.person@gmail.com');
  await agent().post('/api/v1/auth/login').send({ email: 'typo.person@gmail.com', password: 'password123' }).expect(200);
  assert.ok(!(await noa.get('/api/v1/admin/overview').expect(200)).body.email_typos.some((x) => x.id === c.id));
  // Creators can't change emails this way
  await c.agent.patch(`/api/v1/admin/creators/${c.id}`).send({ email: 'x@gmail.com' }).expect(403);
});

// The security test changed the admin password; sign in with whichever is current
async function loginAdmin2() {
  for (const password of ['noa-own-password', 'admin-password']) {
    const a = agent();
    const res = await a.post('/api/v1/auth/login').send({ email: 'admin@test.local', password });
    if (res.status === 200) return a;
  }
  throw new Error('admin login failed');
}

test('admin team: add (temp password + email), promote a creator on purpose, remove', async () => {
  const noa = await loginAdmin2();
  outbox.length = 0;
  const r = await noa.post('/api/v1/admin/admins').send({ email: 'Second.Admin@Test.local' }).expect(201);
  assert.equal(r.body.admin.email, 'second.admin@test.local');
  assert.match(r.body.password, /^[a-z2-9]{12}$/);
  assert.match(outbox[0].subject, /צוות הניהול/);
  assert.ok(!outbox[0].text.includes(r.body.password)); // the password never goes by email

  // The new admin signs in and sees the admin area
  const second = agent();
  const login = await second.post('/api/v1/auth/login').send({ email: 'second.admin@test.local', password: r.body.password }).expect(200);
  assert.equal(login.body.user.role, 'admin');
  await second.get('/api/v1/admin/overview').expect(200);
  const list = (await second.get('/api/v1/admin/admins').expect(200)).body.admins;
  assert.ok(list.find((a) => a.email === 'second.admin@test.local').me);

  await noa.post('/api/v1/admin/admins').send({ email: 'second.admin@test.local' }).expect(409);
  await noa.post('/api/v1/admin/admins').send({ email: 'x@gnail.com' }).expect(400);

  // A creator's address needs an explicit promote
  const c = await makeCreator({ admin: noa });
  const asCreator = await noa.post('/api/v1/admin/admins').send({ email: c.email }).expect(409);
  assert.equal(asCreator.body.error, 'is_creator');
  await noa.post('/api/v1/admin/admins').send({ email: c.email, promote: true }).expect(201);
  await c.agent.get('/api/v1/auth/me').expect(401); // her old creator session ended

  // Creators can't touch this; you can't remove yourself; removing ends their access
  const creator = await makeCreator({ admin: noa });
  await creator.agent.get('/api/v1/admin/admins').expect(403);
  const me = list.find((a) => a.me);
  await second.delete(`/api/v1/admin/admins/${me.id}`).expect(400);
  await noa.delete(`/api/v1/admin/admins/${me.id}`).expect(200);
  // Noa (the owner, ADMIN_EMAIL) can't be removed by anyone
  const all = (await noa.get('/api/v1/admin/admins').expect(200)).body.admins;
  const owner = all.find((x) => x.email === 'admin@test.local');
  assert.equal(owner.owner, true);
  const helper = await noa.post('/api/v1/admin/admins').send({ email: 'third.admin@test.local' }).expect(201);
  const third = agent();
  await third.post('/api/v1/auth/login').send({ email: 'third.admin@test.local', password: helper.body.password }).expect(200);
  const denied = await third.delete(`/api/v1/admin/admins/${owner.id}`).expect(403);
  assert.equal(denied.body.error, 'owner');
  await noa.get('/api/v1/admin/overview').expect(200);
  await second.get('/api/v1/admin/overview').expect(401);
  await agent().post('/api/v1/auth/login').send({ email: 'second.admin@test.local', password: r.body.password }).expect(403);
});
