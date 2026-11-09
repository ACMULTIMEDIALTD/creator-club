import { config } from '../config.js';

export const TYPE_LABELS = { paid: 'בתשלום', barter: 'בארטר', hybrid: 'משולב' };

function ddmm(date) {
  // Israel time, dd/MM
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit' })
    .formatToParts(new Date(date));
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('day')}/${get('month')}`;
}

/** Spec §6 — the only thing that ever goes into the WhatsApp group. */
export function whatsappText(c) {
  return [
    `📣 קמפיין חדש: ${c.title}`,
    `${c.brand_display_name} · ${TYPE_LABELS[c.type]} · מינימום ${Number(c.min_followers).toLocaleString('en-US')} עוקבים`,
    c.short_description,
    `${c.slots} מקומות · הגשה עד ${ddmm(c.deadline_apply)}`,
    `👉 ${config.appUrl}/c/${c.slug}`,
  ].join('\n');
}
