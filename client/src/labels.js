export const TYPE_LABELS = { paid: 'בתשלום', barter: 'בארטר', hybrid: 'משולב' };
export const CAMPAIGN_STATUS = {
  draft: 'טיוטה', open: 'פתוח להגשה', closed: 'סגור', in_progress: 'בביצוע', done: 'הסתיים', cancelled: 'בוטל',
};
export const APP_STATUS = {
  applied: 'ממתינה לתשובה', selected: 'נבחרת 🎉', rejected: 'לא הפעם', withdrawn: 'בוטלה', completed: 'הסרטון אושר ✓',
};
export const APP_STATUS_ADMIN = { ...APP_STATUS, applied: 'הגישה', selected: 'נבחרה', rejected: 'נדחתה' };
export const USER_STATUS = { pending: 'ממתינה', active: 'פעילה', suspended: 'מושעית', left: 'עזבה' };
export const PLATFORMS = { instagram: 'אינסטגרם', tiktok: 'טיקטוק', youtube: 'יוטיוב', other: 'אחר' };
export const GENDER = { mostly_women: 'בעיקר נשים', mostly_men: 'בעיקר גברים', mixed: 'מעורב' };
export const SECTORS = ['כללי', 'דתי', 'ערבי', 'דובר רוסית', 'דובר אנגלית', 'אחר'];
export const BILLING = { osek_patur: 'עוסקת פטורה', osek_murshe: 'עוסקת מורשית', company: 'חברה בע״מ', none: 'אין עדיין' };
export const DOC_TYPES = {
  deal_invoice: 'חשבונית עסקה', tax_invoice: 'חשבונית מס', tax_invoice_receipt: 'חשבונית מס/קבלה', receipt: 'קבלה',
};
export const BANKS = [
  'בנק לאומי (10)', 'בנק הפועלים (12)', 'בנק דיסקונט (11)', 'מזרחי טפחות (20)', 'הבינלאומי (31)', 'מרכנתיל (17)',
  'בנק ירושלים (54)', 'אוצר החייל (14)', 'מסד (46)', 'יהב (04)', 'וואן זירו (18)', 'בנק הדואר (09)',
];
export const TIERS = { A: 'A', B: 'B', new: 'חדשה' };

export const REJECTED_SOFT = 'לא הפעם, את במאגר להבא 💛';

export const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
export const fmtK = (n) => {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
};
const tz = { timeZone: 'Asia/Jerusalem' };
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('he-IL', { ...tz, day: 'numeric', month: 'numeric', year: '2-digit' }) : '—');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('he-IL', { ...tz, day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const daysLeft = (d) => Math.ceil((new Date(d) - Date.now()) / 864e5);
