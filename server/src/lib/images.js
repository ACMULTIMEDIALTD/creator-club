import crypto from 'node:crypto';
import { config } from '../config.js';

const TTL_SECONDS = 24 * 3600;

const sign = (id, exp, kind = 'img') => crypto.createHmac('sha256', config.jwtSecret).update(`${kind}:${id}:${exp}`).digest('base64url');

/**
 * Images are members-only like the rest of the app, but an <img> tag can't send the app's bearer
 * token. So image URLs carry a short-lived signature instead: whoever got the URL from an
 * authenticated API response can load it for 24 hours.
 */
export function imageUrl(id) {
  if (!id) return null;
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  return `/api/v1/images/${id}?exp=${exp}&sig=${sign(id, exp)}`;
}

/** Invoices hold bank details, so their links expire after an hour (and are only given to Noa and the creator). */
export function invoiceFileUrl(id, kind = 'inv') {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const path = kind === 'arc' ? 'archive' : 'invoice';
  return `/api/v1/images/${path}/${id}?exp=${exp}&sig=${sign(id, exp, kind)}`;
}

export function verifyImageSig(id, exp, sig, kind = 'img') {
  const n = Number(exp);
  if (!Number.isInteger(n) || n < Date.now() / 1000 || typeof sig !== 'string') return false;
  const expected = Buffer.from(sign(id, n, kind));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** Identify the format from the file's first bytes; never trust the declared content type. */
export function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/** Invoices may also be PDFs. */
export function sniffDocument(buf) {
  if (buf.length > 4 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return sniffImage(buf);
}
