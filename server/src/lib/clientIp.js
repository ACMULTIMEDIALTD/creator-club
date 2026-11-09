import { isIP } from 'node:net';

const first = (v) => (v ? v.split(',')[0].trim() : null);

/**
 * The visitor's address. Express's req.ip would be the Cloudflare edge in front of Render,
 * shared by many visitors, which broke per-IP rate limits and the IP recorded with the terms.
 *
 * - Render sits behind Cloudflare, which sets CF-Connecting-IP to the address that connected to it
 *   (it replaces any value a visitor sends). For the app, that's the visitor.
 * - The website calls the API through Vercel's /api proxy, so there it's Vercel's address, and
 *   Vercel passes the visitor's in X-Vercel-Forwarded-For.
 *   Caveat: someone calling Render directly could send that header themselves and pick the IP
 *   their own requests count under. Limits that matter for accounts are also keyed by email.
 */
export function clientIp(req) {
  const viaVercel = first(req.get('x-vercel-forwarded-for'));
  if (viaVercel && isIP(viaVercel)) return viaVercel;
  const edge = first(req.get('cf-connecting-ip'));
  if (edge && isIP(edge)) return edge;
  return req.ip;
}

/** Makes req.ip the visitor's address for everything after it (rate limits, logs, terms record). */
export function useClientIp(req, _res, next) {
  Object.defineProperty(req, 'ip', { value: clientIp(req), configurable: true, enumerable: true });
  next();
}
