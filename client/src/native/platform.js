import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/** True inside the iPhone/Android app (Capacitor), false in a browser. */
export const IS_NATIVE = Capacitor.isNativePlatform();
export const PLATFORM = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

/** The app is served from the phone itself, so API calls need the server's full address. */
export const API_BASE = IS_NATIVE ? (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') : '';

// The app keeps its session as a bearer token (a cookie to another host is unreliable in WebViews).
const KEY = 'session_token';
let token;
export async function getToken() {
  if (!IS_NATIVE) return null;
  if (token === undefined) token = (await Preferences.get({ key: KEY })).value || null;
  return token;
}
export async function setToken(t) {
  if (!IS_NATIVE) return;
  token = t || null;
  if (t) await Preferences.set({ key: KEY, value: t });
  else await Preferences.remove({ key: KEY });
}
