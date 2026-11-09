import http2 from 'node:http2';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

// Direct APNs (token-based auth). Used for iPhone devices so the iOS app needs no Firebase SDK.
export const apnsConfigured = () => !!(config.apns.key && config.apns.keyId && config.apns.teamId && config.apns.bundleId);

let cached = { token: null, at: 0 };
function providerToken() {
  // Apple accepts a provider token for up to 60 minutes; refresh every 50
  if (!cached.token || Date.now() - cached.at > 50 * 60 * 1000) {
    cached = {
      at: Date.now(),
      token: jwt.sign({ iss: config.apns.teamId }, config.apns.key, { algorithm: 'ES256', header: { kid: config.apns.keyId } }),
    };
  }
  return cached.token;
}

/** Sends one notification to each device token. Resolves to the tokens Apple says are dead. */
export async function sendApns(tokens, { title, body, url }) {
  const host = config.apns.production ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
  const client = http2.connect(host);
  const dead = [];
  try {
    const payload = JSON.stringify({ aps: { alert: { title, body }, sound: 'default' }, url: url || '/dashboard' });
    await Promise.all(tokens.map((token) => new Promise((resolve) => {
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${providerToken()}`,
        'apns-topic': config.apns.bundleId,
        'apns-push-type': 'alert',
        'content-type': 'application/json',
      });
      let status = 0;
      let data = '';
      req.on('response', (h) => { status = h[':status']; });
      req.on('data', (c) => { data += c; });
      req.on('end', () => {
        if (status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(data)) dead.push(token);
        else if (status !== 200) console.error('apns', status, data);
        resolve();
      });
      req.on('error', (err) => { console.error('apns', err.message); resolve(); });
      req.end(payload);
    })));
  } finally {
    client.close();
  }
  return dead;
}
