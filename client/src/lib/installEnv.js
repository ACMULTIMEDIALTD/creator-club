import { useEffect, useState } from 'react';

// Where is the site open, and can it be added to the home screen from here?

const ua = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent);

export const isIos = () => /iphone|ipad|ipod/i.test(ua()) || (/macintosh/i.test(ua()) && navigator.maxTouchPoints > 1);
export const isAndroid = () => /android/i.test(ua());
export const isMobile = () => isIos() || isAndroid();
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

/**
 * Apps' built-in browsers (WhatsApp/Instagram/Facebook/TikTok on Android, Instagram/Facebook on iPhone).
 * "Add to home screen" doesn't exist there, so the page has to be opened in Chrome/Safari first.
 * WhatsApp on iPhone opens links in a Safari sheet that can't be told apart from Safari itself,
 * so the guide always mentions that case too.
 */
export const isInAppBrowser = () =>
  /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Snapchat|musical_ly|Bytedance|TikTok/i.test(ua())
  || (isAndroid() && /; wv\)/.test(ua()));

/** Android: an intent link that hands the current page to Chrome. */
export const chromeIntentUrl = (path = window.location.pathname + window.location.search) =>
  `intent://${window.location.host}${path}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(window.location.origin + path)};end`;

/** iPhone (iOS 17+): opens the page in Safari from another app's browser. Not documented by Apple; offered as a shortcut only. */
export const safariUrl = (path = window.location.pathname + window.location.search) => `x-safari-${window.location.origin}${path}`;

// Chrome fires beforeinstallprompt once, often before any component mounts, so catch it at load.
let deferredPrompt = null;
const listeners = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    listeners.forEach((fn) => fn(e));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn(null));
  });
}

/** Android/Chrome one-tap install. Returns [available, install()]. */
export function useInstallPrompt() {
  const [prompt, setPrompt] = useState(deferredPrompt);
  useEffect(() => {
    listeners.add(setPrompt);
    return () => listeners.delete(setPrompt);
  }, []);
  const install = async () => {
    if (!prompt) return false;
    prompt.prompt();
    const choice = await prompt.userChoice.catch(() => null);
    deferredPrompt = null;
    setPrompt(null);
    return choice?.outcome === 'accepted';
  };
  return [!!prompt, install];
}
