import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.CURRENT_TERMS_VERSION = 'v1';
const { checkEligibility } = await import('../src/lib/eligibility.js');

const user = { status: 'active' };
const creator = { instagram_followers: 3000, tiktok_followers: 6000, open_to_paid: true, open_to_barter: false, region_id: 4, niche_ids: [1], terms_version: 'v1' };
const campaign = { status: 'open', deadline_apply: new Date(Date.now() + 1e6), type: 'paid', min_followers: 5000 };
const check = (o = {}) => checkEligibility({ user, creator, campaign, ...o });

test('ok when every rule passes (uses max of IG/TikTok)', () => {
  assert.deepEqual(check(), { ok: true });
});

test('reason codes', () => {
  assert.equal(check({ user: { status: 'pending' } }).reason, 'account_pending');
  assert.equal(check({ creator: null }).reason, 'no_profile');
  assert.equal(check({ creator: { ...creator, terms_version: 'v0' } }).reason, 'terms_outdated');
  assert.equal(check({ campaign: { ...campaign, status: 'closed' } }).reason, 'campaign_closed');
  assert.equal(check({ campaign: { ...campaign, deadline_apply: new Date(Date.now() - 1) } }).reason, 'deadline_passed');
  assert.equal(check({ campaign: { ...campaign, type: 'barter' } }).reason, 'not_open_to_barter');
  assert.equal(check({ campaign: { ...campaign, type: 'hybrid' } }).reason, 'missing_address');
  const withAddress = { ...creator, address_street: 'הרצל 1', address_city: 'חיפה' };
  assert.equal(check({ creator: withAddress, campaign: { ...campaign, type: 'hybrid' } }).ok, true);
  assert.equal(check({ application: { status: 'applied' } }).reason, 'already_applied');
  assert.equal(check({ application: { status: 'withdrawn' } }).ok, true);
  assert.equal(check({ campaign: { ...campaign, region_ids: [1, 2] } }).reason, 'region');
  assert.equal(check({ campaign: { ...campaign, required_niche_ids: [3] } }).reason, 'niche');
  assert.equal(check({ campaign: { ...campaign, required_niche_ids: [3, 1] } }).ok, true);
});

test('min_followers message is human readable', () => {
  const r = check({ campaign: { ...campaign, min_followers: 10000 } });
  assert.equal(r.reason, 'min_followers');
  assert.equal(r.message, 'דרוש מינימום 10,000 עוקבים');
});
