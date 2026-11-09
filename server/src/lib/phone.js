/** Normalize Israeli phone numbers to local form: "+972 52-123 4567" → "0521234567". */
export function normalizePhone(input) {
  if (input == null) return null;
  let digits = String(input).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('972')) digits = '0' + digits.slice(3);
  return digits;
}
