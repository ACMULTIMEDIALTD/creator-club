import { config } from '../config.js';
import { hasAddress, shipsProduct } from './address.js';

export const maxFollowers = (c) => Math.max(c?.instagram_followers || 0, c?.tiktok_followers || 0, 0);

const fmt = (n) => Number(n).toLocaleString('en-US');

/**
 * Server-side apply rules (spec §3.1). Returns {ok:true} or {ok:false, reason, message}
 * so the UI can explain *why* rather than show a disabled button.
 *
 * names: optional {niches: Map<id,name>, regions: Map<id,name>} for friendlier messages.
 */
export function checkEligibility({ user, creator, campaign, application, now = new Date(), names }) {
  const block = (reason, message) => ({ ok: false, reason, message });

  if (application && application.status !== 'withdrawn') {
    return block('already_applied', 'כבר הגשת מועמדות לקמפיין הזה');
  }
  if (!creator) return block('no_profile', 'יש להשלים את הפרופיל לפני הגשת מועמדות');
  if (user.status === 'pending') return block('account_pending', 'החשבון שלך ממתין לאישור של נועה');
  if (user.status !== 'active') return block('account_inactive', 'החשבון שלך אינו פעיל');
  if (creator.terms_version !== config.termsVersion) {
    return block('terms_outdated', 'יש לאשר את תנאי הקהילה המעודכנים');
  }
  if (campaign.status !== 'open') return block('campaign_closed', 'הקמפיין סגור להגשות');
  if (now >= new Date(campaign.deadline_apply)) return block('deadline_passed', 'מועד ההגשה עבר');

  if (campaign.type === 'paid' && !creator.open_to_paid) {
    return block('not_open_to_paid', 'זה קמפיין בתשלום, והפרופיל שלך לא מסומן כפתוח לקמפיינים בתשלום');
  }
  if (campaign.type === 'barter' && !creator.open_to_barter) {
    return block('not_open_to_barter', 'זה קמפיין בארטר, והפרופיל שלך לא מסומן כפתוח לבארטר');
  }
  if (campaign.type === 'hybrid' && !creator.open_to_paid && !creator.open_to_barter) {
    return block('not_open_to_type', 'הפרופיל שלך לא מסומן כפתוח לקמפיינים בתשלום או בארטר');
  }

  // Products are shipped to her home, so the address must be in the profile before applying
  if (shipsProduct(campaign.type) && !hasAddress(creator)) {
    return block('missing_address', 'בקמפיין הזה נשלח אלייך מוצר, אז צריך כתובת למשלוח בפרופיל');
  }

  if (maxFollowers(creator) < campaign.min_followers) {
    return block('min_followers', `דרוש מינימום ${fmt(campaign.min_followers)} עוקבים`);
  }

  const reqNiches = campaign.required_niche_ids || [];
  if (reqNiches.length) {
    const mine = new Set(creator.niche_ids || []);
    if (!reqNiches.some((id) => mine.has(id))) {
      const list = reqNiches.map((id) => names?.niches?.get(id)).filter(Boolean).join(', ');
      return block('niche', list ? `הקמפיין מיועד ליוצרות בתחומים: ${list}` : 'הקמפיין מיועד לתחומי תוכן אחרים');
    }
  }

  const regions = campaign.region_ids || [];
  if (regions.length && !regions.includes(creator.region_id)) {
    const list = regions.map((id) => names?.regions?.get(id)).filter(Boolean).join(', ');
    return block('region', list ? `הקמפיין מיועד ליוצרות מאזור: ${list}` : 'הקמפיין מיועד לאזור אחר');
  }

  return { ok: true };
}
