// Example data for the demo build. All names, handles and brands are invented.
export const TERMS_VERSION = '2026-10-v2';

const NICHES = ['אופנה', 'יופי', 'אמהות', 'אוכל', 'לייפסטייל', 'כושר', 'בית', 'טיולים', 'טכנולוגיה', 'פיננסים', 'אחר'];
const REGIONS = ['צפון', 'חיפה והקריות', 'השרון', 'מרכז', 'תל אביב', 'ירושלים', 'שפלה', 'דרום', 'אילת'];

const day = 864e5;
const iso = (offsetDays, h = 23, m = 59) => { const d = new Date(Date.now() + offsetDays * day); d.setHours(h, m, 0, 0); return d.toISOString(); };
const date = (offsetDays) => iso(offsetDays).slice(0, 10);

// [name, city, region, ig, igF, tt, ttF, niches, tier, rating, status, paid, barter, rates, daysAgo]
const PEOPLE = [
  ['מאיה לוי', 'תל אביב', 5, 'maya.levi.style', 48200, 'mayalevi', 31000, [1, 5], 'A', 5, 'active', true, true, [1200, 400, 1800], 210],
  ['שירה כהן', 'רמת גן', 4, 'shira_beauty', 23500, null, null, [2], 'A', 5, 'active', true, true, [800, 250, 1200], 180],
  ['נועם אברהם', 'חיפה', 2, 'noam.mama', 15800, 'noam_mama', 9200, [3, 7], 'B', 4, 'active', true, true, [600, 200, 900], 160],
  ['טל מזרחי', 'ירושלים', 6, 'tal.eats', 31000, 'taleats', 54000, [4], 'A', 4, 'active', true, false, [1000, 350, 1500], 150],
  ['יעל פרץ', 'הרצליה', 3, 'yael.fit', 12100, null, null, [6, 5], 'B', 4, 'active', true, true, [500, 150, 700], 120],
  ['רוני דהן', 'באר שבע', 8, 'roni.home', 7400, 'ronihome', 3100, [7], 'new', null, 'active', false, true, [null, null, null], 90],
  ['הילה ביטון', 'נתניה', 3, 'hila.travels', 19300, null, null, [8, 5], 'B', 3, 'active', true, true, [700, 200, 1000], 75],
  ['ליאור שמעוני', 'פתח תקווה', 4, 'lior.tech.il', 9800, 'liortech', 16200, [9], 'new', null, 'active', true, false, [600, 200, 900], 60],
  ['דנה גולן', 'גבעתיים', 4, 'dana.golan', 4200, null, null, [2, 5], 'new', null, 'active', true, true, [300, 100, 450], 40],
  ['אור חדד', 'אילת', 9, 'or.eilat', 11000, 'oreilat', 6000, [8], 'new', null, 'active', true, true, [500, 150, 800], 30],
  ['מיכל רוזן', 'מודיעין', 4, 'michal.rozen', 6300, null, null, [3, 4], 'new', null, 'pending', true, true, [400, 120, 600], 2],
  ['עדי ששון', 'ראשון לציון', 7, 'adi.sasson', 26700, 'adisasson', 12000, [1, 2], 'new', null, 'pending', true, true, [900, 300, 1300], 1],
];

export function seedState() {
  const users = [{ id: 'admin', email: 'noa@example.com', phone: '0500000000', password: null, role: 'admin', status: 'active', created_at: iso(-400), last_login_at: iso(0, 9) }];
  const creators = [];
  const events = [];
  PEOPLE.forEach(([full_name, city, region_id, ig, igF, tt, ttF, niche_ids, tier, rating, status, paid, barter, [post, story, reel], ago], i) => {
    const id = `c${i + 1}`;
    users.push({ id, email: `${ig.replace(/[._]/g, '')}@example.com`, phone: `05${String(20000000 + i * 1373711).slice(0, 8)}`, password: null, role: 'creator', status, created_at: iso(-ago, 10), last_login_at: iso(-Math.min(ago, i % 5), 20) });
    creators.push({
      user_id: id, full_name, birth_year: 1988 + (i % 10), city, region_id,
      instagram_handle: ig, instagram_followers: igF, tiktok_handle: tt, tiktok_followers: ttF, youtube_url: null, other_platforms: null,
      audience_gender: i % 4 === 3 ? 'mixed' : 'mostly_women', audience_age_min: 22 + (i % 3) * 3, audience_age_max: 38 + (i % 4) * 3, audience_sector: 'כללי',
      open_to_paid: paid, open_to_barter: barter, open_to_events: i % 2 === 0, open_to_affiliate: i % 3 === 0,
      billing_status: post ? (i % 3 ? 'osek_patur' : 'osek_murshe') : 'none',
      niche_ids, links: [{ id: 'l0', url: `https://instagram.com/${ig}`, label: 'הפרופיל שלי' }],
      tier, admin_notes: i === 0 ? 'עובדת מעולה, תמיד בזמן. מתאימה למותגי פרימיום.' : null, internal_rating: rating,
      terms_version: TERMS_VERSION, terms_accepted_at: iso(-ago, 10, 15), terms_ip: '84.229.0.' + (10 + i),
      created_at: iso(-ago, 10), updated_at: iso(-ago, 10),
    });
    events.push({ user_id: id, type: 'signup', payload: null, created_at: iso(-ago, 10) }, { user_id: id, type: 'terms_accepted', payload: null, created_at: iso(-ago, 10, 15) });
  });
  // one signup that never finished the wizard
  users.push({ id: 'c99', email: 'new.signup@example.com', phone: '0547778899', password: null, role: 'creator', status: 'pending', created_at: iso(0, 8), last_login_at: null });

  const brands = [
    { id: 'b1', name: 'Glow Lab קוסמטיקה', contact_name: 'אורית', contact_phone: '03-5550101', contact_email: 'orit@glowlab.example', agreement_signed_at: iso(-30), notes: 'מותג טיפוח טבעוני, משלמים בזמן.', created_at: iso(-60) },
    { id: 'b2', name: 'בייקרי השכונה', contact_name: 'יוסי', contact_phone: '052-5550202', contact_email: 'yossi@bakery.example', agreement_signed_at: iso(-10), notes: null, created_at: iso(-20) },
    { id: 'b3', name: 'StepUp נעליים', contact_name: 'מירב', contact_phone: '054-5550303', contact_email: null, agreement_signed_at: null, notes: 'בשיחות, עוד לא חתמו.', created_at: iso(-5) },
  ];

  const campaigns = [
    {
      id: 'k1', brand_id: 'b1', title: 'השקת סרום ויטמין C', brand_display_name: 'מותג טיפוח טבעוני מוביל',
      short_description: 'מחפשות יוצרות יופי ולייפסטייל לרילס אמיתי על סרום חדש. כולל ערכת מוצרים מלאה.',
      full_brief: 'רילס של 20–40 שניות בשימוש יומיומי בסרום.\nתיוג @glowlab.example ושימוש בהאשטג #GlowLabIL.\nאסור להזכיר מותגים מתחרים.\nטיוטה לאישור עד 3 ימים לפני הפרסום.',
      type: 'hybrid', product_value_ils: 350, payment_note: '₪600 לרילס + ערכת מוצרים בשווי ₪350',
      min_followers: 5000, platforms: ['instagram', 'tiktok'], required_niche_ids: [2, 5], region_ids: null,
      slots: 4, deadline_apply: iso(4), deadline_publish: date(18), status: 'open', slug: 'glow-c', created_by: 'admin', created_at: iso(-3), updated_at: iso(-3),
    },
    {
      id: 'k2', brand_id: 'b2', title: 'ארוחת בוקר בבייקרי', brand_display_name: 'בייקרי שכונתי בתל אביב',
      short_description: 'בארטר: ארוחת בוקר זוגית בבייקרי חדש ביפו בתמורה לסטורי אחד ופוסט.',
      full_brief: 'הגעה בתיאום מראש, ימים א׳–ה׳.\n3 סטוריז עם תיוג מיקום ופוסט אחד בתוך שבוע מההגעה.',
      type: 'barter', product_value_ils: 220, payment_note: 'ארוחת בוקר זוגית (שווי ₪220)',
      min_followers: 3000, platforms: ['instagram'], required_niche_ids: [4, 5], region_ids: [5, 4],
      slots: 6, deadline_apply: iso(9), deadline_publish: date(25), status: 'open', slug: 'bakery-jaffa', created_by: 'admin', created_at: iso(-1), updated_at: iso(-1),
    },
    {
      id: 'k3', brand_id: 'b3', title: 'קולקציית נעלי ספורט', brand_display_name: 'מותג נעליים ישראלי',
      short_description: 'שיתוף פעולה בתשלום עם יוצרות כושר ולייפסטייל. טיוטה, עוד לא פורסם.',
      full_brief: null, type: 'paid', product_value_ils: null, payment_note: '₪900 לרילס',
      min_followers: 10000, platforms: ['instagram'], required_niche_ids: [6], region_ids: null,
      slots: 3, deadline_apply: iso(14), deadline_publish: null, status: 'draft', slug: 'stepup-fit', created_by: 'admin', created_at: iso(0, 8), updated_at: iso(0, 8),
    },
    {
      id: 'k5', brand_id: null, title: 'רילס לרשת אופנה', brand_display_name: 'רשת אופנה ארצית',
      short_description: 'קמפיין בתשלום לקולקציית החורף. 3 רילסים לכל יוצרת לאורך חודש.',
      full_brief: 'שלושה רילסים: לוק עבודה, לוק ערב, לוק סופ״ש.', type: 'paid', product_value_ils: null, payment_note: '₪2,400 לשלושה רילסים',
      min_followers: 20000, platforms: ['instagram'], required_niche_ids: [1], region_ids: null,
      slots: 2, deadline_apply: iso(6), deadline_publish: date(40), status: 'open', slug: 'fashion-winter', created_by: 'admin', created_at: iso(-2), updated_at: iso(-2),
    },
    {
      id: 'k4', brand_id: 'b1', title: 'קרם הגנה לקיץ', brand_display_name: 'Glow Lab',
      short_description: 'קמפיין קיץ שהסתיים. 5 יוצרות פרסמו רילס על קרם ההגנה.',
      full_brief: 'רילס חוף/בריכה עם המוצר.', type: 'paid', product_value_ils: null, payment_note: '₪500 לרילס',
      min_followers: 8000, platforms: ['instagram'], required_niche_ids: null, region_ids: null,
      slots: 5, deadline_apply: iso(-60), deadline_publish: date(-40), status: 'done', slug: 'glow-spf', created_by: 'admin', created_at: iso(-70), updated_at: iso(-40),
    },
  ];

  const app = (n, k, c, status, message, ago) => ({
    id: `a${n}`, campaign_id: k, creator_id: c, message, status, admin_note: null,
    applied_at: iso(-ago, 12), decided_at: status === 'applied' ? null : iso(-ago + 1, 9),
  });
  const applications = [
    app(1, 'k1', 'c1', 'selected', 'עבדתי עם מותגי טיפוח טבעוניים, הקהל שלי מאוד מגיב לזה', 2),
    app(2, 'k1', 'c2', 'applied', 'יופי זה הבית שלי, ואני משתמשת בסרום ויטמין C כבר שנים', 2),
    app(3, 'k1', 'c7', 'applied', null, 1),
    app(4, 'k1', 'c9', 'applied', 'אשמח לנסות!', 1),
    app(5, 'k2', 'c4', 'applied', 'אוכל זה כל מה שאני עושה 🍳', 0),
    app(6, 'k2', 'c1', 'applied', null, 0),
    app(7, 'k4', 'c1', 'completed', null, 62),
    app(8, 'k4', 'c2', 'completed', null, 62),
    app(9, 'k4', 'c5', 'rejected', null, 61),
  ];

  return {
    niches: NICHES.map((name, i) => ({ id: i + 1, name })),
    regions: REGIONS.map((name, i) => ({ id: i + 1, name })),
    users, creators, brands, campaigns, applications, events,
    session: null,
    demoCreatorId: 'c9', // דנה גולן: active, 4.2K followers. Applied to one, eligible for one, blocked from one
  };
}
