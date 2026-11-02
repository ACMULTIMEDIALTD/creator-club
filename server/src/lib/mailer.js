import nodemailer from 'nodemailer';
import { config } from '../config.js';

const transport = config.smtpUrl ? nodemailer.createTransport(config.smtpUrl) : null;
export const outbox = []; // populated in tests / when no SMTP is configured

/**
 * replyTo: who gets it when the recipient hits "reply". Creator emails → Noa (config.mailReplyTo);
 * brand inquiries → the brand, so Noa can just reply.
 */
export async function sendMail({ to, subject, html, text, replyTo = config.mailReplyTo }) {
  if (!to) return;
  const msg = { from: config.mailFrom, to, subject, html, text };
  if (replyTo && replyTo !== to) msg.replyTo = replyTo;
  if (!transport) {
    outbox.push(msg);
    if (outbox.length > 50) outbox.shift();
    if (!config.isTest) console.log(`[mail] to=${to} subject=${subject}\n${text}`);
    return;
  }
  try {
    await transport.sendMail(msg);
  } catch (err) {
    console.error('mail failed', to, subject, err.message);
  }
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- branded template (the site's burgundy-on-cream look) ----------
// Email clients ignore <style> blocks and web fonts unevenly, so everything is inline and table-based.
const C = { wine: '#6E030B', cream: '#FFFBED', cream2: '#FBF1E2', paper: '#FFFFFF', ink: '#2B1316', muted: '#7D6466', line: '#ECDCCB', wa: '#1FA855' };
const FONT = "Heebo, Assistant, Arial, Helvetica, sans-serif";
const SERIF = "'Frank Ruhl Libre', 'David Libre', Georgia, 'Times New Roman', serif";

function button(label, url, color = C.wine) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 8px">
  <tr><td align="center" bgcolor="${color}" style="border-radius:999px">
    <a href="${esc(url)}" target="_blank" style="display:inline-block;padding:14px 34px;font-family:${FONT};font-size:17px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px">${esc(label)}</a>
  </td></tr></table>`;
}

/**
 * @param {object} o
 * @param {string} o.preheader  inbox preview line
 * @param {string} o.title      big serif heading
 * @param {string} o.body       HTML paragraphs (already escaped)
 * @param {{label:string,url:string}} [o.cta]       main button
 * @param {{label:string,url:string}} [o.secondary] second button (e.g. WhatsApp group)
 * @param {string} [o.note]     small print under the buttons
 */
function layout({ preheader, title, body, cta, secondary, note }) {
  const app = config.appUrl;
  // Give every <p> the base text style; a <p style="..."> keeps its own styles on top
  const p = (html) => html.replace(/<p(?: style="([^"]*)")?>/g,
    (_, extra = '') => `<p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.7;color:${C.ink};${extra}">`);
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.cream};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.cream}">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.cream}" style="background:${C.cream}">
<tr><td align="center" style="padding:28px 14px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px" dir="rtl">
    <tr><td align="center" style="padding:0 0 18px">
      <a href="${app}" target="_blank"><img src="${app}/logo-512.jpg" width="104" height="104" alt="The Creator Club" style="display:block;border:0;border-radius:52px"></a>
    </td></tr>
    <tr><td bgcolor="${C.paper}" style="background:${C.paper};border:1px solid ${C.line};border-radius:18px;padding:32px 28px;text-align:right" dir="rtl">
      <h1 style="margin:0 0 16px;font-family:${SERIF};font-size:26px;line-height:1.3;color:${C.wine};font-weight:700;text-align:right">${esc(title)}</h1>
      ${p(body)}
      ${cta ? button(cta.label, cta.url) : ''}
      ${secondary ? button(secondary.label, secondary.url, C.wa) : ''}
      ${cta ? `<p style="margin:14px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted};text-align:center">הכפתור לא עובד? אפשר להעתיק את הקישור:<br><a href="${esc(cta.url)}" style="color:${C.wine};word-break:break-all">${esc(cta.url)}</a></p>` : ''}
      ${note ? `<p style="margin:18px 0 0;padding-top:14px;border-top:1px solid ${C.line};font-family:${FONT};font-size:13px;line-height:1.6;color:${C.muted}">${note}</p>` : ''}
    </td></tr>
    <tr><td align="center" style="padding:22px 10px 6px;font-family:${FONT};font-size:12px;line-height:1.8;color:${C.muted}">
      <b style="color:${C.wine};font-family:${SERIF};font-size:14px">The Creator Club</b> · קהילת יוצרות התוכן של נועה אביטל<br>
      <a href="${app}/dashboard" style="color:${C.muted}">האזור האישי</a> &nbsp;·&nbsp;
      <a href="${app}/terms" style="color:${C.muted}">תנאי הקהילה</a> &nbsp;·&nbsp;
      <a href="${app}/accessibility" style="color:${C.muted}">הצהרת נגישות</a><br>
      <span style="font-size:11px">מערכת זו נבנתה על ידי <a href="https://an-web.co.il" style="color:${C.muted}">A.N Web Design</a></span>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

const row = (k, v) => `<tr><td style="padding:6px 0;font-family:${FONT};font-size:14px;color:${C.muted};white-space:nowrap;vertical-align:top">${k}</td><td style="padding:6px 12px 6px 0;font-family:${FONT};font-size:15px;color:${C.ink}">${v}</td></tr>`;
const details = (rows) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px;width:100%;background:${C.cream2};border-radius:12px;padding:10px 16px" dir="rtl">${rows.join('')}</table>`;

export const mails = {
  magicLink: (to, url, code) => sendMail({
    to,
    subject: code ? `קוד הכניסה שלך: ${code}` : 'קישור הכניסה שלך ל-The Creator Club',
    text: `${code ? `קוד הכניסה שלך: ${code}\n(מקלידים אותו במסך הכניסה, גם באפליקציה שבמסך הבית)\n\n` : ''}או כניסה בלחיצה על הקישור (תקף ל-30 דקות):\n${url}\n\nאם לא ביקשת להתחבר, אפשר להתעלם מהמייל.`,
    html: layout({
      preheader: code ? `הקוד שלך: ${code}. תקף ל-30 דקות.` : 'לחיצה אחת ואת בפנים. הקישור תקף ל-30 דקות.',
      title: 'הכניסה שלך מוכנה ✨',
      body: `${code ? `<p>הקלידי את הקוד הזה במסך הכניסה:</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:6px auto 18px">
          <tr><td align="center" style="background:${C.cream2};border:1px dashed ${C.wine};border-radius:14px;padding:14px 26px;font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:${C.wine}" dir="ltr">${code}</td></tr>
        </table>
        <p style="text-align:center">נכנסת מהאפליקציה שבמסך הבית? השתמשי בקוד, כדי להישאר בתוך האפליקציה.</p>
        <p style="text-align:center;margin-top:18px">או כניסה בלחיצה, בדפדפן:</p>` : '<p>היי,</p><p>ביקשת להיכנס לקהילה. לחיצה על הכפתור תכניס אותך ישר לאזור האישי, בלי סיסמה.</p>'}`,
      cta: { label: 'כניסה לקהילה', url },
      note: 'הקוד והקישור תקפים ל-30 דקות ולשימוש אחד. אם לא ביקשת להתחבר, אפשר פשוט להתעלם מהמייל.',
    }),
  }),

  signupReceived: (to) => sendMail({
    to,
    subject: 'קיבלנו את ההרשמה שלך 💛',
    text: `תודה שנרשמת ל-The Creator Club!\nנועה עוברת על כל פרופיל אישית ומאשרת חברות תוך 48 שעות. נעדכן אותך במייל.\n\nהאזור האישי: ${config.appUrl}/dashboard`,
    html: layout({
      preheader: 'נועה עוברת על כל פרופיל אישית ומאשרת תוך 48 שעות.',
      title: 'קיבלנו את ההרשמה שלך 💛',
      body: `<p>תודה שהצטרפת ל-The Creator Club!</p>
        <p>הקהילה סגורה ונבחרת, ולכן נועה עוברת על כל פרופיל באופן אישי. החברות מאושרת בדרך כלל <b>תוך 48 שעות</b>, ונעדכן אותך כאן במייל.</p>
        <p>בינתיים אפשר להיכנס לאזור האישי ולוודא שהפרופיל שלך מלא ומעודכן.</p>`,
      cta: { label: 'לאזור האישי', url: `${config.appUrl}/dashboard` },
    }),
  }),

  approved: (to) => {
    const wa = config.whatsappGroupUrl;
    return sendMail({
      to,
      subject: 'ברוכה הבאה לקהילה! 🎉',
      text: `החברות שלך אושרה! כנסי לאזור האישי כדי לראות את הקמפיינים הפתוחים:\n${config.appUrl}/dashboard${wa ? `\n\nהצטרפות לקבוצת הווטסאפ: ${wa}` : ''}`,
      html: layout({
        preheader: 'החברות שלך אושרה. הקמפיינים הפתוחים מחכים לך.',
        title: 'ברוכה הבאה לקהילה! 🎉',
        body: `<p>החברות שלך ב-The Creator Club <b>אושרה</b>, ואנחנו שמחות שאת איתנו.</p>
          <p>באזור האישי מחכים לך הקמפיינים הפתוחים. מוצאת משהו שמתאים? מגישים מועמדות בלחיצה.</p>
          ${wa ? '<p>קמפיינים חדשים מתפרסמים קודם בקבוצת הווטסאפ של הקהילה, אז כדאי להצטרף.</p>' : ''}`,
        cta: { label: 'לקמפיינים הפתוחים', url: `${config.appUrl}/dashboard` },
        secondary: wa ? { label: 'הצטרפות לקבוצת הווטסאפ', url: wa } : undefined,
        note: `טיפ: אפשר להוסיף את הקהילה למסך הבית בטלפון, כמו אפליקציה. <a href="${config.appUrl}/install" style="color:${C.wine}">איך עושים את זה</a>`,
      }),
    });
  },

  selected: (to, campaign) => {
    const url = `${config.appUrl}/c/${campaign.slug}`;
    const ships = campaign.type === 'barter' || campaign.type === 'hybrid';
    return sendMail({
      to,
      subject: `נבחרת לקמפיין: ${campaign.title} 🎉`,
      text: `נבחרת לקמפיין "${campaign.title}"! הבריף המלא ותנאי התשלום מחכים לך כאן:\n${url}${ships ? '\n\nבקמפיין הזה נשלח אלייך מוצר: אשרי בעמוד הקמפיין את כתובת המשלוח.' : ''}`,
      html: layout({
        preheader: `הבריף המלא ותנאי התשלום של "${campaign.title}" מחכים לך.`,
        title: 'נבחרת! 🎉',
        body: `<p>מזל טוב! נבחרת לקמפיין:</p>
          ${details([row('קמפיין', `<b>${esc(campaign.title)}</b>`)])}
          <p style="margin-top:14px">בעמוד הקמפיין מחכים לך הבריף המלא ותנאי התשלום. כדאי לקרוא אותם עכשיו ולשים לב ללוחות הזמנים.</p>
          ${ships ? '<p><b>בקמפיין הזה נשלח אלייך מוצר:</b> אשרי בעמוד הקמפיין שכתובת המשלוח נכונה, כדי שהחבילה תגיע למקום הנכון.</p>' : ''}`,
        cta: { label: 'לבריף המלא', url },
        note: 'שאלות על הקמפיין? פני לנועה בווטסאפ.',
      }),
    });
  },

  contentApproved: (to, campaign) => {
    const url = `${config.appUrl}/c/${campaign.slug}`;
    return sendMail({
      to,
      subject: `הסרטון אושר: ${campaign.title} ✓ אפשר להעלות חשבונית`,
      text: `הסרטון שלך לקמפיין "${campaign.title}" אושר!\nהשלב הבא: להעלות חשבונית (או קבלה) ופרטי חשבון בנק בעמוד הקמפיין:\n${url}`,
      html: layout({
        preheader: `השלב הבא בקמפיין "${campaign.title}": חשבונית ופרטי בנק.`,
        title: 'הסרטון אושר ✓',
        body: `<p>עבודה מעולה! הסרטון שלך לקמפיין הזה אושר:</p>
          ${details([row('קמפיין', `<b>${esc(campaign.title)}</b>`)])}
          <p style="margin-top:14px">כדי שנוכל להעביר את התשלום, צריך להעלות בעמוד הקמפיין <b>חשבונית עסקה, חשבונית מס או קבלה</b> על הסכום שסוכם, ולמלא את פרטי חשבון הבנק.</p>`,
        cta: { label: 'להעלאת החשבונית', url },
        note: 'התשלום מועבר לפי תנאי הקהילה. שאלות? פני לנועה בווטסאפ.',
      }),
    });
  },

  paid: (to, a) => {
    const url = `${config.appUrl}/c/${a.slug}`;
    const amount = a.amount_ils ? `₪${Number(a.amount_ils).toLocaleString('en-US')}` : null;
    return sendMail({
      to,
      subject: `התשלום על "${a.title}" הועבר 💸`,
      text: `התשלום על הקמפיין "${a.title}"${amount ? ` (${amount})` : ''} הועבר לחשבון שמסרת.\n${url}`,
      html: layout({
        preheader: 'התשלום הועבר לחשבון הבנק שמסרת.',
        title: 'התשלום הועבר 💸',
        body: `<p>התשלום על הקמפיין הועבר לחשבון הבנק שמסרת:</p>
          ${details([row('קמפיין', `<b>${esc(a.title)}</b>`), ...(amount ? [row('סכום', `<span dir="ltr">${amount}</span>`)] : [])])}
          <p style="margin-top:14px">ההעברה עשויה להופיע בחשבון תוך כמה ימי עסקים. תודה על שיתוף הפעולה!</p>`,
        cta: { label: 'לעמוד הקמפיין', url },
      }),
    });
  },

  invoiceUploaded: ({ name, title, amount, docType }) => {
    const url = `${config.appUrl}/admin/payments`;
    return sendMail({
      to: config.notifyEmail,
      subject: `חשבונית חדשה: ${name} · ${title}`,
      text: `${name} העלתה ${docType} על ₪${amount} לקמפיין "${title}".\n${url}`,
      html: layout({
        preheader: `${name} העלתה ${docType} לקמפיין "${title}".`,
        title: 'חשבונית חדשה ממתינה לתשלום',
        body: `${details([
          row('יוצרת', `<b>${esc(name)}</b>`),
          row('קמפיין', esc(title)),
          row('מסמך', esc(docType)),
          row('סכום', `<span dir="ltr">₪${Number(amount).toLocaleString('en-US')}</span>`),
        ])}`,
        cta: { label: 'למסך התשלומים', url },
      }),
    });
  },

  accountDeleted: ({ full_name: name, email, terms_version: terms, terms_accepted_at: acceptedAt, archived, unpaid }) => sendMail({
    to: config.notifyEmail,
    subject: `יוצרת מחקה את החשבון: ${name || email}`,
    text: `${name || ''} (${email}) מחקה את החשבון שלה.${archived ? ` ${archived} חשבוניות נשמרו בארכיון התשלומים${unpaid ? `, מתוכן ${unpaid} שעוד לא שולמו` : ''}.` : ''}`,
    html: layout({
      preheader: `${name || email} מחקה את החשבון שלה בקהילה.`,
      title: 'יוצרת מחקה את החשבון',
      body: `${details([
          row('שם', `<b>${esc(name || '—')}</b>`),
          row('מייל', `<span dir="ltr">${esc(email)}</span>`),
          ...(terms ? [row('תנאים שאישרה', `<span dir="ltr">${esc(terms)}</span> · ${new Date(acceptedAt).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}`)] : []),
        ])}
        <p style="margin-top:14px">הפרופיל, ההגשות והנתונים שלה נמחקו. תיעוד אישור התנאים נשמר, וסעיפי אי-העקיפה והסודיות ממשיכים לחול עליה 12 חודשים.${archived ? ` <b>${archived} חשבוניות</b> נשמרו בארכיון התשלומים${unpaid ? `, ומתוכן <b>${unpaid} עוד לא שולמו</b>` : ''}.` : ''}</p>`,
      cta: archived ? { label: 'לארכיון התשלומים', url: `${config.appUrl}/admin/payments` } : undefined,
    }),
  }),

  adminAdded: (to, by) => {
    const url = `${config.appUrl}/login?next=%2Fadmin`;
    return sendMail({
      to,
      subject: 'הוספת לצוות הניהול של The Creator Club',
      text: `${by} הוסיפה אותך כמנהל/ת ב-The Creator Club.\nהסיסמה הזמנית נשלחת אלייך בנפרד, ואפשר גם להיכנס עם קוד למייל:\n${url}`,
      html: layout({
        preheader: 'נוספת כמנהל/ת במערכת הקהילה.',
        title: 'ברוכים הבאים לצוות הניהול',
        body: `<p>הוספת כמנהל/ת במערכת של The Creator Club, על ידי <span dir="ltr">${esc(by)}</span>.</p>
          <p>הסיסמה הזמנית נשלחת אלייך בנפרד. אפשר גם להיכנס בלי סיסמה, עם קוד שנשלח למייל הזה.</p>`,
        cta: { label: 'כניסה למערכת', url },
        note: 'לא ציפית למייל הזה? פני לנועה.',
      }),
    });
  },

  newSignup: (name, email) => {
    const url = `${config.appUrl}/admin/creators?status=pending`;
    return sendMail({
      to: config.notifyEmail,
      replyTo: email,
      subject: `יוצרת חדשה ממתינה לאישור: ${name}`,
      text: `${name} (${email}) השלימה הרשמה.\n${url}`,
      html: layout({
        preheader: `${name} השלימה הרשמה וממתינה לאישור שלך.`,
        title: 'יוצרת חדשה ממתינה לאישור',
        body: `<p>יוצרת חדשה השלימה את ההרשמה:</p>${details([row('שם', `<b>${esc(name)}</b>`), row('מייל', `<span dir="ltr">${esc(email)}</span>`)])}`,
        cta: { label: 'לאישור במאגר היוצרות', url },
      }),
    });
  },

  brandInquiry: (data) => sendMail({
    to: config.notifyEmail,
    replyTo: data.email,
    subject: `פנייה ממותג: ${data.brand}`,
    text: Object.entries(data).map(([k, v]) => `${k}: ${v ?? ''}`).join('\n'),
    html: layout({
      preheader: `${data.brand} השאירו פרטים בעמוד המותגים.`,
      title: 'פנייה חדשה ממותג',
      body: `${details([
        row('שם', esc(data.name)),
        row('מותג', `<b>${esc(data.brand)}</b>`),
        row('טלפון', `<a href="tel:${esc(data.phone)}" style="color:${C.wine}" dir="ltr">${esc(data.phone)}</a>`),
        row('מייל', `<a href="mailto:${esc(data.email)}" style="color:${C.wine}" dir="ltr">${esc(data.email)}</a>`),
      ])}${data.message ? `<p style="margin-top:14px;white-space:pre-wrap">${esc(data.message)}</p>` : ''}`,
      cta: data.email ? { label: 'מענה במייל', url: `mailto:${data.email}?subject=${encodeURIComponent(`The Creator Club · ${data.brand}`)}` } : undefined,
    }),
  }),
};
