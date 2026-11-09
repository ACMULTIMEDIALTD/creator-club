// In-browser stand-in for the Express API, used only by the demo build (VITE_DEMO=1).
// Mirrors the server's rules (eligibility, brief visibility, close → auto-reject) closely
// enough to click through every screen. State lives in memory + localStorage.
import { seedState, TERMS_VERSION } from './seed.js';

const KEY = 'creator-club-demo-v1';
let db = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* storage blocked → fresh seed */ }
  return seedState();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignore */ }
}
export function resetDemo() { db = seedState(); save(); }
export function demoLoginAs(role) {
  db.session = role === 'admin' ? db.users.find((u) => u.role === 'admin').id : db.demoCreatorId;
  save();
}
export const demoSessionRole = () => db.users.find((u) => u.id === db.session)?.role || null;

class Fail extends Error {
  constructor(status, body) { super(body.message || body.error); this.status = status; this.body = body; }
}
const fail = (status, error, message, extra) => { throw new Fail(status, { error, message, ...extra }); };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(16).slice(2) + Date.now().toString(16));
const now = () => new Date().toISOString();
const clone = (x) => JSON.parse(JSON.stringify(x));
const maxF = (c) => Math.max(c?.instagram_followers || 0, c?.tiktok_followers || 0, 0);
const nicheName = (id) => db.niches.find((n) => n.id === id)?.name;
const regionName = (id) => db.regions.find((r) => r.id === id)?.name;
const creatorOf = (id) => db.creators.find((c) => c.user_id === id) || null;
const userOf = (id) => db.users.find((u) => u.id === id) || null;
const event = (user_id, type, payload = null) => db.events.unshift({ user_id, type, payload, created_at: now() });

function me() {
  const u = userOf(db.session);
  if (!u) fail(401, 'unauthenticated', 'יש להתחבר');
  return u;
}
const requireAdmin = () => { const u = me(); if (u.role !== 'admin') fail(403, 'forbidden'); return u; };
const publicUser = ({ id, email, phone, role, status }) => ({ id, email, phone, role, status });

function eligibility(user, creator, c, app) {
  const block = (reason, message) => ({ ok: false, reason, message });
  if (app && app.status !== 'withdrawn') return block('already_applied', 'כבר הגשת מועמדות לקמפיין הזה');
  if (!creator) return block('no_profile', 'יש להשלים את הפרופיל לפני הגשת מועמדות');
  if (user.status === 'pending') return block('account_pending', 'החשבון שלך ממתין לאישור של נועה');
  if (user.status !== 'active') return block('account_inactive', 'החשבון שלך אינו פעיל');
  if (creator.terms_version !== TERMS_VERSION) return block('terms_outdated', 'יש לאשר את תנאי הקהילה המעודכנים');
  if (c.status !== 'open') return block('campaign_closed', 'הקמפיין סגור להגשות');
  if (Date.now() >= new Date(c.deadline_apply)) return block('deadline_passed', 'מועד ההגשה עבר');
  if (c.type === 'paid' && !creator.open_to_paid) return block('not_open_to_paid', 'זה קמפיין בתשלום, והפרופיל שלך לא מסומן כפתוח לקמפיינים בתשלום');
  if (c.type === 'barter' && !creator.open_to_barter) return block('not_open_to_barter', 'זה קמפיין בארטר, והפרופיל שלך לא מסומן כפתוח לבארטר');
  if (c.type === 'hybrid' && !creator.open_to_paid && !creator.open_to_barter) return block('not_open_to_type', 'הפרופיל שלך לא מסומן כפתוח לקמפיינים בתשלום או בארטר');
  if (maxF(creator) < c.min_followers) return block('min_followers', `דרוש מינימום ${c.min_followers.toLocaleString('en-US')} עוקבים`);
  const req = c.required_niche_ids || [];
  if (req.length && !req.some((id) => creator.niche_ids.includes(id))) return block('niche', `הקמפיין מיועד ליוצרות בתחומים: ${req.map(nicheName).join(', ')}`);
  const regs = c.region_ids || [];
  if (regs.length && !regs.includes(creator.region_id)) return block('region', `הקמפיין מיועד ליוצרות מאזור: ${regs.map(regionName).join(', ')}`);
  return { ok: true };
}

const PUBLIC_FIELDS = ['slug', 'title', 'brand_display_name', 'short_description', 'type', 'product_value_ils', 'min_followers', 'platforms', 'required_niche_ids', 'region_ids', 'slots', 'deadline_apply', 'deadline_publish', 'status'];
const imageUrl = (id) => (id && db.images?.[id]) || null;
const pub = (c) => ({ ...Object.fromEntries(PUBLIC_FIELDS.map((f) => [f, c[f] ?? null])), image_url: imageUrl(c.image_id) });
const myApp = (c, uid_) => {
  const a = db.applications.find((x) => x.campaign_id === c.id && x.creator_id === uid_);
  return a ? { id: a.id, status: a.status, message: a.message, applied_at: a.applied_at, decided_at: a.decided_at } : null;
};
const counts = (c) => {
  const apps = db.applications.filter((a) => a.campaign_id === c.id);
  return {
    applied_count: apps.filter((a) => a.status === 'applied').length,
    selected_count: apps.filter((a) => ['selected', 'completed'].includes(a.status)).length,
    total_count: apps.filter((a) => a.status !== 'withdrawn').length,
  };
};
const adminCampaign = (c) => ({ ...clone(c), image_url: imageUrl(c.image_id), brand_name: db.brands.find((b) => b.id === c.brand_id)?.name || null, ...counts(c) });

function creatorRow(u) {
  const c = creatorOf(u.id);
  return {
    id: u.id, email: u.email, phone: u.phone, status: u.status, created_at: u.created_at, last_login_at: u.last_login_at,
    has_profile: !!c, ...(c || {}),
    region_name: c ? regionName(c.region_id) || null : null,
    max_followers: c ? maxF(c) : 0,
    niches: c ? c.niche_ids.map(nicheName).filter(Boolean) : [],
    selected_count: db.applications.filter((a) => a.creator_id === u.id && ['selected', 'completed'].includes(a.status)).length,
  };
}

function validateProfile(b, creating) {
  const f = {};
  if (!b.full_name || b.full_name.trim().length < 2) f.full_name = 'שדה חובה';
  const ig = (b.instagram_handle || '').trim().replace(/^@+/, '');
  const tt = (b.tiktok_handle || '').trim().replace(/^@+/, '');
  if (!ig && !tt) f.instagram_handle = 'יש להזין לפחות חשבון אינסטגרם או טיקטוק';
  if (ig && (b.instagram_followers === '' || b.instagram_followers == null)) f.instagram_followers = 'כמה עוקבים יש באינסטגרם?';
  if (tt && (b.tiktok_followers === '' || b.tiktok_followers == null)) f.tiktok_followers = 'כמה עוקבים יש בטיקטוק?';
  if (!b.niches?.length) f.niches = 'יש לבחור לפחות תחום אחד';
  const street = (b.address_street || '').trim();
  const city = (b.address_city || '').trim();
  if (b.open_to_barter && !street) f.address_street = 'כתובת למשלוח מוצרים (רחוב ומספר)';
  if ((b.open_to_barter || street) && !city) f.address_city = 'באיזו עיר?';
  if (street && !b.address_confirmed) f.address_confirmed = 'יש לאשר שהכתובת נכונה';
  if (creating && b.terms_accept?.version !== TERMS_VERSION) f.terms_accept = 'יש לאשר את תנאי הקהילה';
  (b.links || []).forEach((l, i) => { if (!/^https?:\/\/\S+\.\S+/.test(l.url)) f[`links.${i}.url`] = 'קישור לא תקין'; });
  if (Object.keys(f).length) fail(400, 'validation_error', 'הנתונים שנשלחו אינם תקינים', { fields: f });
  const num = (v) => (v === '' || v == null ? null : Number(v));
  return {
    full_name: b.full_name.trim(), birth_year: num(b.birth_year), city: b.city || null, region_id: num(b.region_id),
    instagram_handle: ig || null, instagram_followers: num(b.instagram_followers),
    tiktok_handle: tt || null, tiktok_followers: num(b.tiktok_followers),
    youtube_url: b.youtube_url || null, other_platforms: b.other_platforms || null,
    audience_gender: b.audience_gender || null, audience_age_min: num(b.audience_age_min), audience_age_max: num(b.audience_age_max),
    audience_sector: b.audience_sector || null,
    open_to_paid: !!b.open_to_paid, open_to_barter: !!b.open_to_barter, open_to_events: !!b.open_to_events, open_to_affiliate: !!b.open_to_affiliate,
    billing_status: b.billing_status || 'none',
    address_street: street || null, address_apt: b.address_apt || null, address_city: city || null, address_zip: b.address_zip || null,
    address_confirmed_at: street ? now() : null,
    niche_ids: [...new Set(b.niches)],
    links: (b.links || []).map((l, i) => ({ id: `l${i}`, url: l.url, label: l.label || null })),
  };
}

function validateCampaign(b, partial) {
  const f = {};
  const has = (k) => !partial || k in b;
  if (has('title') && !(b.title || '').trim()) f.title = 'שדה חובה';
  if (has('brand_display_name') && !(b.brand_display_name || '').trim()) f.brand_display_name = 'שדה חובה';
  if (has('short_description') && (b.short_description || '').trim().length < 5) f.short_description = 'שדה חובה';
  if (has('slots') && !(Number(b.slots) >= 1)) f.slots = 'לפחות מקום אחד';
  if (has('deadline_apply') && Number.isNaN(new Date(b.deadline_apply).getTime())) f.deadline_apply = 'תאריך לא תקין';
  if (has('platforms') && !(b.platforms || []).length) f.platforms = 'יש לבחור פלטפורמה';
  if (b.slug && !/^[a-z0-9][a-z0-9-]{2,39}$/.test(b.slug)) f.slug = 'אותיות באנגלית, ספרות ומקפים (3–40)';
  if (b.slug && db.campaigns.some((c) => c.slug === b.slug && c.id !== b.__id)) f.slug = 'הכתובת הזו כבר בשימוש';
  if (Object.keys(f).length) fail(400, 'validation_error', 'הנתונים שנשלחו אינם תקינים', { fields: f });
  const out = {};
  const num = (v) => (v === '' || v == null ? null : Number(v));
  const map = {
    brand_id: (v) => v || null, title: (v) => v.trim(), brand_display_name: (v) => v.trim(), short_description: (v) => v.trim(),
    full_brief: (v) => v || null, type: (v) => v, product_value_ils: num, payment_note: (v) => v || null,
    min_followers: (v) => Number(v) || 0, platforms: (v) => v, required_niche_ids: (v) => (v?.length ? v : null),
    region_ids: (v) => (v?.length ? v : null), slots: Number, deadline_apply: (v) => new Date(v).toISOString(),
    deadline_publish: (v) => v || null, slug: (v) => v || undefined, image_id: (v) => v || null,
  };
  for (const [k, fn] of Object.entries(map)) if (k in b && b[k] !== undefined) { const v = fn(b[k]); if (v !== undefined) out[k] = v; }
  return out;
}

function ddmm(d) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit' }).formatToParts(new Date(d));
  return `${p.find((x) => x.type === 'day').value}/${p.find((x) => x.type === 'month').value}`;
}
const TYPE = { paid: 'בתשלום', barter: 'בארטר', hybrid: 'משולב' };

function updateApps(ids, status, note) {
  let found = 0;
  for (const a of db.applications.filter((x) => ids.includes(x.id))) {
    found++;
    if (status && a.status !== status) {
      a.status = status;
      a.decided_at = status === 'applied' ? null : now();
    }
    if (note !== undefined) a.admin_note = note;
  }
  return found;
}

// ---------- routes ----------
const routes = [
  ['POST', '/auth/signup', (b) => {
    const email = (b.email || '').trim().toLowerCase();
    const phone = (b.phone || '').replace(/\D/g, '').replace(/^972/, '0');
    const f = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) f.email = 'כתובת מייל לא תקינה';
    if (!/^0\d{8,9}$/.test(phone)) f.phone = 'מספר טלפון לא תקין';
    if (b.password && b.password.length < 8) f.password = 'סיסמה של 8 תווים לפחות';
    if (Object.keys(f).length) fail(400, 'validation_error', 'הנתונים שנשלחו אינם תקינים', { fields: f });
    if (db.users.some((u) => u.email === email)) fail(409, 'email_taken', 'המייל הזה כבר רשום — אפשר להתחבר');
    if (db.users.some((u) => u.phone === phone)) fail(409, 'phone_taken', 'מספר הטלפון הזה כבר רשום — אפשר להתחבר');
    const u = { id: uid(), email, phone, password: b.password || null, role: 'creator', status: 'pending', created_at: now(), last_login_at: null };
    db.users.push(u);
    db.session = u.id;
    event(u.id, 'signup');
    return { user: publicUser(u) };
  }],
  ['POST', '/auth/login', (b) => {
    const u = db.users.find((x) => x.email === (b.email || '').trim().toLowerCase());
    if (!b.password) {
      // Demo: no email to send, so the "magic link" logs straight in.
      if (u) { db.session = u.id; u.last_login_at = now(); }
      return { ok: true, magic: true, demo_logged_in: !!u };
    }
    if (!u || (u.password && u.password !== b.password)) fail(401, 'invalid_credentials', 'מייל או סיסמה שגויים');
    db.session = u.id; u.last_login_at = now();
    return { user: publicUser(u) };
  }],
  ['DELETE', '/me/account', (b) => {
    const u = me();
    if (b?.acknowledge_terms !== true) fail(400, 'validation_error', 'יש לאשר שקראת את ההסבר על התנאים', { fields: { acknowledge_terms: 'יש לאשר' } });
    if (b?.confirm !== 'מחיקה') fail(400, 'validation_error', 'יש להקליד "מחיקה" לאישור', { fields: { confirm: 'יש להקליד "מחיקה" לאישור' } });
    db.creators = db.creators.filter((c) => c.user_id !== u.id);
    db.applications = db.applications.filter((x) => x.creator_id !== u.id);
    db.users = db.users.filter((x) => x.id !== u.id);
    db.session = null;
    return { ok: true };
  }],
  ['POST', '/auth/logout', () => { db.session = null; return { ok: true }; }],
  ['GET', '/auth/me', () => {
    const u = me();
    if (['suspended', 'left'].includes(u.status)) { db.session = null; fail(403, 'account_inactive', 'החשבון אינו פעיל'); }
    const c = creatorOf(u.id);
    return {
      user: publicUser(u),
      profile: c ? { full_name: c.full_name, terms_version: c.terms_version, terms_accepted_at: c.terms_accepted_at } : null,
      needs_profile: u.role === 'creator' && !c,
      needs_terms: !!c && c.terms_version !== TERMS_VERSION,
      terms: { version: TERMS_VERSION, pdf_url: '' },
      whatsapp_group_url: u.status === 'active' ? 'https://chat.whatsapp.com/' : null,
      has_password: !!u.password,
      can_reset_password: true,
    };
  }],
  ['POST', '/auth/password', (b) => {
    if ((b.password || '').length < 8) fail(400, 'validation_error', 'סיסמה של 8 תווים לפחות');
    me().password = b.password;
    return { ok: true };
  }],
  ['GET', '/public/meta', () => ({ niches: db.niches, regions: db.regions, terms: { version: TERMS_VERSION, pdf_url: '' }, mail_enabled: true })],
  ['POST', '/public/brand-inquiry', (b) => {
    const f = {};
    if (!(b.name || '').trim()) f.name = 'שדה חובה';
    if (!(b.brand || '').trim()) f.brand = 'שדה חובה';
    if ((b.phone || '').trim().length < 9) f.phone = 'מספר טלפון לא תקין';
    if (!/^\S+@\S+\.\S+$/.test(b.email || '')) f.email = 'כתובת מייל לא תקינה';
    if (Object.keys(f).length) fail(400, 'validation_error', 'הנתונים שנשלחו אינם תקינים', { fields: f });
    return { ok: true };
  }],

  ['GET', '/me/profile', () => ({ profile: clone(creatorOf(me().id)) })],
  ['PUT', '/me/profile', (b) => {
    const u = me();
    const existing = creatorOf(u.id);
    const data = validateProfile(b, !existing);
    if (existing) {
      Object.assign(existing, data, { updated_at: now() });
      if (b.terms_accept?.version === TERMS_VERSION) Object.assign(existing, { terms_version: TERMS_VERSION, terms_accepted_at: now() });
      event(u.id, 'profile_updated');
    } else {
      db.creators.push({ user_id: u.id, ...data, tier: 'new', admin_notes: null, internal_rating: null, terms_version: TERMS_VERSION, terms_accepted_at: now(), terms_ip: 'demo', created_at: now(), updated_at: now() });
      event(u.id, 'terms_accepted'); event(u.id, 'profile_created');
    }
    const p = clone(creatorOf(u.id));
    delete p.tier; delete p.admin_notes; delete p.internal_rating;
    return { profile: p };
  }],
  ['POST', '/me/terms', (b) => {
    const c = creatorOf(me().id);
    if (b.version !== TERMS_VERSION) fail(409, 'terms_version_mismatch', 'גרסת התנאים התעדכנה — יש לרענן את הדף');
    Object.assign(c, { terms_version: TERMS_VERSION, terms_accepted_at: now() });
    return { terms_version: c.terms_version };
  }],
  ['GET', '/me/applications', () => {
    const u = me();
    return {
      applications: db.applications.filter((a) => a.creator_id === u.id)
        .sort((x, y) => y.applied_at.localeCompare(x.applied_at))
        .map((a) => {
          const c = db.campaigns.find((x) => x.id === a.campaign_id);
          return { ...a, slug: c.slug, title: c.title, brand_display_name: c.brand_display_name, type: c.type, campaign_status: c.status, deadline_apply: c.deadline_apply };
        }),
    };
  }],

  ['GET', '/campaigns', () => {
    const u = me();
    if (u.role === 'creator' && u.status !== 'active') return { campaigns: [], locked: true };
    const cr = creatorOf(u.id);
    return {
      locked: false,
      campaigns: db.campaigns
        .filter((c) => c.status === 'open' && new Date(c.deadline_apply) > new Date())
        .sort((a, b) => a.deadline_apply.localeCompare(b.deadline_apply))
        .map((c) => {
          const app = myApp(c, u.id);
          return { ...pub(c), my_application: app, eligibility: u.role === 'creator' ? eligibility(u, cr, c, app) : null };
        }),
    };
  }],
  ['GET', '/campaigns/:slug', (_b, { slug }) => {
    const u = me();
    const c = db.campaigns.find((x) => x.slug === slug);
    const app = c && myApp(c, u.id);
    const admin = u.role === 'admin';
    if (!c || (!admin && (c.status === 'draft' || (c.status !== 'open' && !app)))) fail(404, 'campaign_not_found');
    const selected = ['selected', 'completed'].includes(app?.status);
    const campaign = {
      ...pub(c),
      niche_names: (c.required_niche_ids || []).map(nicheName).filter(Boolean),
      region_names: (c.region_ids || []).map(regionName).filter(Boolean),
    };
    if (selected || admin) Object.assign(campaign, { full_brief: c.full_brief, payment_note: c.payment_note });
    return { campaign, my_application: app, selected, eligibility: admin ? null : eligibility(u, creatorOf(u.id), c, app) };
  }],
  ['POST', '/campaigns/:slug/apply', (b, { slug }) => {
    const u = me();
    const c = db.campaigns.find((x) => x.slug === slug && x.status !== 'draft');
    if (!c) fail(404, 'campaign_not_found');
    const existing = db.applications.find((a) => a.campaign_id === c.id && a.creator_id === u.id);
    const e = eligibility(u, creatorOf(u.id), c, existing);
    if (!e.ok) fail(422, e.reason, e.message);
    const message = (b.message || '').trim().slice(0, 300) || null;
    if (existing) Object.assign(existing, { status: 'applied', message, applied_at: now(), decided_at: null });
    else db.applications.push({ id: uid(), campaign_id: c.id, creator_id: u.id, message, status: 'applied', admin_note: null, applied_at: now(), decided_at: null });
    event(u.id, 'applied');
    return { application: myApp(c, u.id) };
  }],
  ['DELETE', '/campaigns/:slug/apply', (_b, { slug }) => {
    const u = me();
    const c = db.campaigns.find((x) => x.slug === slug);
    const a = c && db.applications.find((x) => x.campaign_id === c.id && x.creator_id === u.id && x.status === 'applied');
    if (!a) fail(409, 'cannot_withdraw', 'אפשר לבטל רק מועמדות שעדיין לא טופלה');
    Object.assign(a, { status: 'withdrawn', decided_at: now() });
    return { application: { id: a.id, status: a.status } };
  }],

  ['GET', '/admin/overview', () => {
    requireAdmin();
    const creators = db.users.filter((u) => u.role === 'creator');
    const order = { open: 0, closed: 1, in_progress: 2 };
    return {
      campaigns: db.campaigns.filter((c) => c.status in order)
        .sort((a, b) => order[a.status] - order[b.status] || a.deadline_apply.localeCompare(b.deadline_apply))
        .map(adminCampaign),
      pending: creators.filter((u) => u.status === 'pending').map(creatorRow).sort((a, b) => (a.has_profile === b.has_profile ? 0 : a.has_profile ? -1 : 1)),
      stats: {
        active: creators.filter((u) => u.status === 'active').length,
        pending_complete: creators.filter((u) => u.status === 'pending' && creatorOf(u.id)).length,
        pending_incomplete: creators.filter((u) => u.status === 'pending' && !creatorOf(u.id)).length,
      },
    };
  }],
  ['GET', '/admin/creators', (_b, _p, q) => {
    requireAdmin();
    let rows = db.users.filter((u) => u.role === 'creator').map(creatorRow);
    const term = (q.get('q') || '').trim().replace(/^@/, '').toLowerCase();
    if (term) rows = rows.filter((r) => [r.full_name, r.email, r.phone, r.instagram_handle, r.tiktok_handle, r.city].some((v) => v && String(v).toLowerCase().includes(term)));
    if (q.get('niche')) rows = rows.filter((r) => r.niche_ids?.includes(Number(q.get('niche'))));
    if (q.get('region')) rows = rows.filter((r) => r.region_id === Number(q.get('region')));
    if (q.get('min_followers')) rows = rows.filter((r) => r.max_followers >= Number(q.get('min_followers')));
    if (q.get('tier')) rows = rows.filter((r) => r.tier === q.get('tier'));
    if (q.get('status')) rows = rows.filter((r) => r.status === q.get('status'));
    const ot = { paid: 'open_to_paid', barter: 'open_to_barter', events: 'open_to_events', affiliate: 'open_to_affiliate' }[q.get('open_to')];
    if (ot) rows = rows.filter((r) => r[ot]);
    const sort = q.get('sort');
    rows.sort(sort === 'followers' ? (a, b) => b.max_followers - a.max_followers
      : sort === 'name' ? (a, b) => (a.full_name || 'ת').localeCompare(b.full_name || 'ת', 'he')
        : (a, b) => b.created_at.localeCompare(a.created_at));
    return { creators: rows };
  }],
  ['GET', '/admin/creators/:id', (_b, { id }) => {
    requireAdmin();
    const u = userOf(id);
    if (!u || u.role !== 'creator') fail(404, 'creator_not_found');
    return {
      user: publicUser({ ...u, created_at: u.created_at }) && { ...publicUser(u), created_at: u.created_at, last_login_at: u.last_login_at },
      profile: clone(creatorOf(id)),
      applications: db.applications.filter((a) => a.creator_id === id).map((a) => {
        const c = db.campaigns.find((x) => x.id === a.campaign_id);
        return { ...a, campaign_id: c.id, title: c.title, slug: c.slug, type: c.type };
      }),
      events: db.events.filter((e) => e.user_id === id).slice(0, 30),
    };
  }],
  ['PATCH', '/admin/creators/:id', (b, { id }) => {
    requireAdmin();
    const u = userOf(id);
    if (!u) fail(404, 'creator_not_found');
    const c = creatorOf(id);
    if (b.status && b.status !== u.status) {
      if (b.status === 'active' && !c) fail(400, 'no_profile', 'אי אפשר לאשר יוצרת שלא השלימה פרופיל');
      u.status = b.status;
    }
    if (b.internal_rating != null && !(b.internal_rating >= 1 && b.internal_rating <= 5)) fail(400, 'validation_error', 'דירוג לא תקין');
    for (const k of ['tier', 'admin_notes', 'internal_rating']) if (k in b) {
      if (!c) fail(400, 'no_profile', 'ליוצרת אין עדיין פרופיל');
      c[k] = b[k];
    }
    return { creator: { id, status: u.status, tier: c?.tier, admin_notes: c?.admin_notes, internal_rating: c?.internal_rating } };
  }],

  ['POST', '/admin/creators/:id/reset-password', (_b, { id }) => {
    requireAdmin();
    const u = userOf(id);
    if (!u || u.role !== 'creator') fail(404, 'creator_not_found');
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    u.password = Array.from({ length: 10 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    return { password: u.password };
  }],
  ['POST', '/admin/images', (b) => {
    requireAdmin();
    if (!/^data:image\//.test(b.__dataUrl || '')) fail(400, 'invalid_image', 'אפשר להעלות רק תמונה');
    const id = uid();
    db.images = { ...(db.images || {}), [id]: b.__dataUrl };
    return { id, url: b.__dataUrl };
  }],
  ['GET', '/admin/brands', () => {
    requireAdmin();
    return { brands: db.brands.map((b) => ({ ...b, campaign_count: db.campaigns.filter((c) => c.brand_id === b.id).length })).sort((a, b) => a.name.localeCompare(b.name, 'he')) };
  }],
  ['POST', '/admin/brands', (b) => {
    requireAdmin();
    if (!(b.name || '').trim()) fail(400, 'validation_error', 'שדה חובה', { fields: { name: 'שדה חובה' } });
    const brand = { id: uid(), ...b, agreement_signed_at: b.agreement_signed_at || null, created_at: now() };
    db.brands.push(brand);
    return { brand };
  }],
  ['PATCH', '/admin/brands/:id', (b, { id }) => {
    requireAdmin();
    const brand = db.brands.find((x) => x.id === id);
    if (!brand) fail(404, 'brand_not_found');
    if ('name' in b && !b.name.trim()) fail(400, 'validation_error', 'שדה חובה', { fields: { name: 'שדה חובה' } });
    Object.assign(brand, b, { agreement_signed_at: b.agreement_signed_at || null });
    return { brand };
  }],
  ['DELETE', '/admin/brands/:id', (_b, { id }) => {
    requireAdmin();
    if (db.campaigns.some((c) => c.brand_id === id)) fail(409, 'brand_in_use', 'למותג יש קמפיינים — אי אפשר למחוק');
    db.brands = db.brands.filter((x) => x.id !== id);
    return { ok: true };
  }],

  ['GET', '/admin/campaigns', (_b, _p, q) => {
    requireAdmin();
    const order = { open: 0, draft: 1, closed: 2, in_progress: 3 };
    return {
      campaigns: db.campaigns.filter((c) => !q.get('status') || c.status === q.get('status'))
        .sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4) || b.deadline_apply.localeCompare(a.deadline_apply))
        .map(adminCampaign),
    };
  }],
  ['POST', '/admin/campaigns', (b) => {
    const u = requireAdmin();
    const d = validateCampaign(b, false);
    const c = {
      id: uid(), brand_id: null, full_brief: null, payment_note: null, product_value_ils: null, required_niche_ids: null, region_ids: null,
      deadline_publish: null, min_followers: 0, platforms: ['instagram'], ...d,
      slug: d.slug || Math.random().toString(16).slice(2, 8),
      status: b.status === 'open' ? 'open' : 'draft', created_by: u.id, created_at: now(), updated_at: now(),
    };
    db.campaigns.push(c);
    return { campaign: clone(c) };
  }],
  ['GET', '/admin/campaigns/:id', (_b, { id }) => {
    requireAdmin();
    const c = db.campaigns.find((x) => x.id === id);
    if (!c) fail(404, 'campaign_not_found');
    return { campaign: adminCampaign(c) };
  }],
  ['PATCH', '/admin/campaigns/:id', (b, { id }) => {
    requireAdmin();
    const c = db.campaigns.find((x) => x.id === id);
    if (!c) fail(404, 'campaign_not_found');
    Object.assign(c, validateCampaign({ ...b, __id: id }, true), { updated_at: now() });
    let auto = 0;
    if (b.status && b.status !== c.status) {
      c.status = b.status;
      if (['closed', 'cancelled', 'in_progress', 'done'].includes(b.status)) {
        for (const a of db.applications.filter((x) => x.campaign_id === id && x.status === 'applied')) {
          Object.assign(a, { status: 'rejected', decided_at: now() });
          auto++;
        }
      }
    }
    return { campaign: adminCampaign(c), auto_rejected: auto };
  }],
  ['DELETE', '/admin/campaigns/:id', (_b, { id }) => {
    requireAdmin();
    const c = db.campaigns.find((x) => x.id === id);
    if (!c) fail(404, 'campaign_not_found');
    if (c.status !== 'draft') fail(409, 'not_draft', 'אפשר למחוק רק טיוטה. לקמפיין פעיל — בטלי אותו.');
    db.campaigns = db.campaigns.filter((x) => x.id !== id);
    return { ok: true };
  }],
  ['GET', '/admin/campaigns/:id/applications', (_b, { id }) => {
    requireAdmin();
    const c = db.campaigns.find((x) => x.id === id);
    if (!c) fail(404, 'campaign_not_found');
    const so = { selected: 0, completed: 1, applied: 2, rejected: 3 };
    const to = { A: 0, B: 1 };
    const apps = db.applications.filter((a) => a.campaign_id === id).map((a) => {
      const r = creatorRow(userOf(a.creator_id));
      return { ...r, ...a, creator_id: a.creator_id, user_status: r.status, status: a.status };
    }).sort((x, y) => (so[x.status] ?? 4) - (so[y.status] ?? 4) || (to[x.tier] ?? 2) - (to[y.tier] ?? 2) || y.max_followers - x.max_followers);
    return { campaign: adminCampaign(c), applications: apps };
  }],
  ['GET', '/admin/campaigns/:id/whatsapp-text', (_b, { id }) => {
    requireAdmin();
    const c = db.campaigns.find((x) => x.id === id);
    return {
      text: [
        `📣 קמפיין חדש: ${c.title}`,
        `${c.brand_display_name} · ${TYPE[c.type]} · מינימום ${c.min_followers.toLocaleString('en-US')} עוקבים`,
        c.short_description,
        `${c.slots} מקומות · הגשה עד ${ddmm(c.deadline_apply)}`,
        `👉 https://club.noaavital.co.il/c/${c.slug}`,
      ].join('\n'),
    };
  }],
  ['PATCH', '/admin/applications/:id', (b, { id }) => {
    requireAdmin();
    if (!updateApps([id], b.status, b.admin_note)) fail(404, 'application_not_found');
    return { ok: true, updated: 1 };
  }],
  ['POST', '/admin/applications/bulk', (b) => {
    requireAdmin();
    return { ok: true, updated: updateApps(b.ids || [], b.status) };
  }],
  ['POST', '/admin/applications/:id/paid', (b, { id }) => {
    requireAdmin();
    const a = db.applications.find((x) => x.id === id);
    if (!a) fail(404, 'application_not_found');
    a.paid_at = b.paid ? a.paid_at || now() : null;
    return { ok: true };
  }],
  // Demo: approved videos in paid campaigns; every other one "uploaded" a sample invoice
  ['GET', '/admin/payments', () => {
    requireAdmin();
    const rows = db.applications.filter((a) => a.status === 'completed')
      .map((a) => ({ a, c: db.campaigns.find((x) => x.id === a.campaign_id), cr: creatorOf(a.creator_id) }))
      .filter(({ c }) => c && c.type !== 'barter');
    return {
      payments: rows.map(({ a, c, cr }, i) => ({
        id: a.id,
        approved_at: a.decided_at,
        paid_at: a.paid_at || null,
        creator: { id: a.creator_id, full_name: cr?.full_name, phone: db.users.find((u) => u.id === a.creator_id)?.phone, billing_status: cr?.billing_status },
        campaign: { id: c.id, title: c.title, slug: c.slug, payment_note: c.payment_note },
        invoice: i % 2 ? null : {
          doc_type: 'receipt', amount_ils: 400, account_holder: cr?.full_name, bank_name: 'בנק לאומי (10)', branch: '812', account_number: '123456',
          uploaded_at: a.decided_at, file_name: 'קבלה.pdf', file_mime: 'application/pdf', file_url: '#',
        },
      })),
    };
  }],
];

const compiled = routes.map(([method, path, fn]) => {
  const keys = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  return { method, re, keys, fn };
});

export async function mockRequest(method, fullPath, body) {
  await new Promise((r) => setTimeout(r, 120)); // feel like a network call
  const [path, search = ''] = fullPath.split('?');
  for (const r of compiled) {
    if (r.method !== method) continue;
    const m = path.match(r.re);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    try {
      const out = r.fn(body || {}, params, new URLSearchParams(search));
      save();
      return { ok: true, status: 200, data: clone(out) };
    } catch (e) {
      if (e instanceof Fail) return { ok: false, status: e.status, data: e.body };
      console.error(e);
      return { ok: false, status: 500, data: { error: 'server_error', message: 'משהו השתבש בהדגמה' } };
    }
  }
  return { ok: false, status: 404, data: { error: 'not_found' } };
}
