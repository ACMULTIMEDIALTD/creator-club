import { config } from '../config.js';
import { query } from '../db.js';
import { checkEligibility } from './eligibility.js';
import { lookupNames } from './campaigns.js';
import { apnsConfigured, sendApns } from './apns.js';

export const pushOutbox = []; // used in tests / logged when Firebase isn't configured

let messagingPromise;
/** firebase-admin is loaded lazily and only when FIREBASE_SERVICE_ACCOUNT is set. */
function messaging() {
  if (!config.firebaseServiceAccount) return null;
  messagingPromise ??= (async () => {
    const { initializeApp, cert } = await import('firebase-admin/app');
    const { getMessaging } = await import('firebase-admin/messaging');
    const app = initializeApp({ credential: cert(JSON.parse(config.firebaseServiceAccount)) }, 'push');
    return getMessaging(app);
  })();
  return messagingPromise;
}

export async function registerDevice(userId, token, platform) {
  await query(
    `INSERT INTO push_devices (token, user_id, platform) VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, last_seen_at = now()`,
    [token, userId, platform],
  );
}

export async function unregisterDevice(token) {
  await query('DELETE FROM push_devices WHERE token = $1', [token]);
}

/**
 * Notify users on every phone they registered. `url` is an in-app path the app opens on tap.
 * iPhones go straight to Apple (APNs), Android phones through Firebase Cloud Messaging.
 * Never throws: a failed push must not fail the admin action that triggered it.
 */
export async function sendPush(userIds, { title, body, url }) {
  try {
    if (!userIds.length) return;
    const { rows } = await query('SELECT token, platform FROM push_devices WHERE user_id = ANY($1::uuid[])', [userIds]);
    if (!rows.length) return;
    const ios = rows.filter((r) => r.platform === 'ios').map((r) => r.token);
    const android = rows.filter((r) => r.platform === 'android').map((r) => r.token);
    const fcm = android.length ? await messaging() : null;
    const canIos = ios.length && apnsConfigured();

    if (!canIos && !fcm) {
      pushOutbox.push({ userIds, title, body, url, devices: rows.length });
      if (pushOutbox.length > 50) pushOutbox.shift();
      if (!config.isTest) console.log(`[push] ${title} → ${rows.length} device(s) (push keys not configured)`);
      return;
    }

    const dead = [];
    if (canIos) dead.push(...(await sendApns(ios, { title, body, url })));
    if (fcm) {
      for (let i = 0; i < android.length; i += 500) {
        const batch = android.slice(i, i + 500);
        const res = await fcm.sendEachForMulticast({
          tokens: batch,
          notification: { title, body },
          data: { url: url || '/dashboard' },
          android: { priority: 'high', notification: { color: '#6E030B' } },
        });
        res.responses.forEach((r, j) => {
          if (!r.success && /registration-token-not-registered|invalid-registration-token/.test(r.error?.code || '')) dead.push(batch[j]);
        });
      }
    }
    // Drop tokens that no longer work (app uninstalled, token rotated)
    if (dead.length) await query('DELETE FROM push_devices WHERE token = ANY($1::text[])', [dead]);
  } catch (err) {
    console.error('push failed', err.message);
  }
}

/** New open campaign → push only to active creators who can actually apply. */
export async function notifyCampaignOpened(campaign) {
  try {
    const [{ rows: creators }, names] = await Promise.all([
      query(
        `SELECT u.id, u.status, c.instagram_followers, c.tiktok_followers, c.region_id, c.terms_version,
                c.open_to_paid, c.open_to_barter,
                COALESCE((SELECT array_agg(niche_id) FROM creator_niches WHERE creator_id = c.user_id), '{}') AS niche_ids
         FROM users u JOIN creators c ON c.user_id = u.id
         WHERE u.role = 'creator' AND u.status = 'active'
           AND EXISTS (SELECT 1 FROM push_devices d WHERE d.user_id = u.id)`,
      ),
      lookupNames(),
    ]);
    const eligible = creators
      .filter((c) => checkEligibility({ user: c, creator: c, campaign, names }).ok)
      .map((c) => c.id);
    await sendPush(eligible, {
      title: `קמפיין חדש: ${campaign.title}`,
      body: `${campaign.brand_display_name} · ${campaign.slots} מקומות. מתאים לך, אפשר להגיש עכשיו.`,
      url: `/c/${campaign.slug}`,
    });
  } catch (err) {
    console.error('campaign push failed', err.message);
  }
}
