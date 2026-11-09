import { IS_NATIVE, PLATFORM } from './platform.js';

let pushToken = null;
let started = false;
export const currentPushToken = () => pushToken;

/**
 * Ask for notification permission once the user is signed in, register the phone with the
 * server, and open the right screen when a notification is tapped.
 */
export async function startPush({ register, navigate }) {
  if (!IS_NATIVE || started) return;
  // Android push needs Firebase (google-services.json); without it registering would crash the app.
  // The cloud build sets VITE_ANDROID_PUSH=1 only when it adds that file.
  if (PLATFORM === 'android' && import.meta.env.VITE_ANDROID_PUSH !== '1') return;
  started = true;
  const { PushNotifications } = await import('@capacitor/push-notifications');

  await PushNotifications.addListener('registration', async ({ value }) => {
    pushToken = value;
    try { await register(value, PLATFORM); } catch { /* retried on next launch */ }
  });
  await PushNotifications.addListener('registrationError', (e) => console.warn('push registration failed', e));
  await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const url = notification.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) navigate(url);
  });

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
  if (perm.receive === 'granted') await PushNotifications.register();
}
