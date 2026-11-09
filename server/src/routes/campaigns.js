import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { HttpError, notFound, parse } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';
import { checkEligibility } from '../lib/eligibility.js';
import { publicCampaign, lookupNames, eligibilityCreator } from '../lib/campaigns.js';
import { logEvent } from '../lib/events.js';
import { needsPayment, paymentFor } from '../lib/payments.js';
import { shipsProduct } from '../lib/address.js';

const router = Router();
router.use(requireAuth);

const MY_APP = `(SELECT row_to_json(a) FROM (
   SELECT id, status, message, applied_at, decided_at, shipping_address, address_confirmed_at FROM applications
   WHERE campaign_id = c.id AND creator_id = $1) a) AS my_application`;

/** Open campaigns board. Only active members see it — the board is part of what membership buys. */
router.get('/', async (req, res) => {
  if (req.user.role === 'creator' && req.user.status !== 'active') {
    return res.json({ campaigns: [], locked: true });
  }
  const [{ rows }, creator, names] = await Promise.all([
    query(
      `SELECT c.*, ${MY_APP} FROM campaigns c
       WHERE c.status = 'open' AND c.deadline_apply > now()
       ORDER BY c.deadline_apply ASC`,
      [req.user.id],
    ),
    eligibilityCreator(req.user.id),
    lookupNames(),
  ]);
  res.json({
    locked: false,
    campaigns: rows.map((c) => ({
      ...publicCampaign(c),
      my_application: c.my_application,
      eligibility: req.user.role === 'creator'
        ? checkEligibility({ user: req.user, creator, campaign: c, application: c.my_application, names })
        : null,
    })),
  });
});

async function loadForUser(req) {
  const c = await one(`SELECT c.*, ${MY_APP} FROM campaigns c WHERE c.slug = $2`, [req.user.id, req.params.slug]);
  if (!c) throw notFound('campaign_not_found');
  const isAdmin = req.user.role === 'admin';
  // Drafts never leak; cancelled/finished campaigns stay visible only to those who applied.
  if (!isAdmin && (c.status === 'draft' || (c.status !== 'open' && !c.my_application))) {
    throw notFound('campaign_not_found');
  }
  return c;
}

async function shippingFor(userId, application) {
  const address = await one(
    'SELECT address_street, address_apt, address_city, address_zip FROM creators WHERE user_id = $1',
    [userId],
  );
  return { address, confirmed_at: application.address_confirmed_at, shipping_address: application.shipping_address };
}

router.get('/:slug', async (req, res) => {
  const c = await loadForUser(req);
  const isAdmin = req.user.role === 'admin';
  const [creator, names] = await Promise.all([eligibilityCreator(req.user.id), lookupNames()]);
  const selected = ['selected', 'completed'].includes(c.my_application?.status);

  const campaign = {
    ...publicCampaign(c),
    niche_names: (c.required_niche_ids || []).map((id) => names.niches.get(id)).filter(Boolean),
    region_names: (c.region_ids || []).map((id) => names.regions.get(id)).filter(Boolean),
  };
  if (selected || isAdmin) {
    campaign.full_brief = c.full_brief;
    campaign.payment_note = c.payment_note;
  }

  if (!isAdmin) await logEvent(req.user.id, 'campaign_viewed', { campaign_id: c.id });
  res.json({
    campaign,
    my_application: c.my_application,
    selected,
    // Selected for a campaign with a product: she confirms where to ship it
    shipping: selected && shipsProduct(c.type) ? await shippingFor(req.user.id, c.my_application) : null,
    payment: needsPayment(c.my_application, c.type) ? await paymentFor(req.user.id, c.my_application.id) : null,
    eligibility: isAdmin ? null : checkEligibility({ user: req.user, creator, campaign: c, application: c.my_application, names }),
  });
});

const applySchema = z.object({
  message: z.preprocess((v) => (v == null ? null : String(v).trim() || null), z.string().max(300, 'עד 300 תווים').nullable()).optional(),
});

router.post('/:slug/apply', async (req, res) => {
  if (req.user.role !== 'creator') throw new HttpError(403, 'forbidden');
  const { message = null } = parse(applySchema, req.body);

  const application = await tx(async (db) => {
    // Lock the campaign row so a close/apply race can't leave a stray 'applied' row behind.
    const { rows: [c] } = await db.query(
      `SELECT c.*, ${MY_APP} FROM campaigns c WHERE c.slug = $2 FOR UPDATE`,
      [req.user.id, req.params.slug],
    );
    if (!c || c.status === 'draft') throw notFound('campaign_not_found');
    const [creator, names] = await Promise.all([eligibilityCreator(req.user.id, db), lookupNames(db)]);
    const elig = checkEligibility({ user: req.user, creator, campaign: c, application: c.my_application, names });
    if (!elig.ok) throw new HttpError(422, elig.reason, elig.message);

    const { rows: [a] } = await db.query(
      `INSERT INTO applications (campaign_id, creator_id, message) VALUES ($1, $2, $3)
       ON CONFLICT (campaign_id, creator_id) DO UPDATE
         SET status = 'applied', message = EXCLUDED.message, applied_at = now(), decided_at = NULL
         WHERE applications.status = 'withdrawn'
       RETURNING id, status, message, applied_at, decided_at`,
      [c.id, req.user.id, message],
    );
    if (!a) throw new HttpError(422, 'already_applied', 'כבר הגשת מועמדות לקמפיין הזה');
    await logEvent(req.user.id, 'applied', { campaign_id: c.id, application_id: a.id }, db);
    return a;
  });
  res.status(201).json({ application });
});

router.delete('/:slug/apply', async (req, res) => {
  const a = await one(
    `UPDATE applications a SET status = 'withdrawn', decided_at = now()
     FROM campaigns c
     WHERE c.id = a.campaign_id AND c.slug = $1 AND a.creator_id = $2 AND a.status = 'applied'
     RETURNING a.id, a.status, a.campaign_id`,
    [req.params.slug, req.user.id],
  );
  if (!a) throw new HttpError(409, 'cannot_withdraw', 'אפשר לבטל רק מועמדות שעדיין לא טופלה');
  await logEvent(req.user.id, 'withdrawn', { campaign_id: a.campaign_id, application_id: a.id });
  res.json({ application: { id: a.id, status: a.status } });
});

export default router;
