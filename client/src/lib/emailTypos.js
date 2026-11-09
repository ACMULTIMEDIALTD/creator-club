// Common misspellings of popular email domains → the domain the person meant.
// A misspelled address means no sign-in codes, no "you were selected" emails, nothing.
// (Kept in sync with server/src/lib/emailTypos.js.)
export const DOMAIN_TYPOS = {
  'gnail.com': 'gmail.com', 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com',
  'gmaill.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com',
  'gmail.om': 'gmail.com', 'gmali.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmeil.com': 'gmail.com',
  'gmail.co.il': 'gmail.com', 'gimail.com': 'gmail.com', 'gmaul.com': 'gmail.com', 'fmail.com': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'homail.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'hotmal.com': 'hotmail.com', 'hotmil.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com', 'outloo.com': 'outlook.com',
  'yahooo.com': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com',
  'iclod.com': 'icloud.com', 'icloud.co': 'icloud.com', 'icoud.com': 'icloud.com', 'icloud.con': 'icloud.com',
  'wala.co.il': 'walla.co.il', 'walla.co': 'walla.co.il', 'walla.com': 'walla.co.il',
};

/** "dana@gnail.com" → "dana@gmail.com"; null when the domain isn't a known typo. */
export function suggestEmail(email) {
  const m = /^(.+)@([^@]+)$/.exec(String(email || '').trim().toLowerCase());
  const fixed = m && DOMAIN_TYPOS[m[2]];
  return fixed ? `${m[1]}@${fixed}` : null;
}
