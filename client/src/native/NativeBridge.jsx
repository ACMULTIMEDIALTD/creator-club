import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { IS_NATIVE } from './platform.js';
import { startPush } from './push.js';
import { DEMO } from '../demo/flag.js';

// Paths the app accepts from links (universal / app links, push taps)
const APP_PATHS = /^\/(c\/|m\/|dashboard|me|admin|login|join)/;

/** Native-only glue: status bar, splash, opening links in the app, and push notifications. */
export default function NativeBridge() {
  const nav = useNavigate();
  const { me } = useAuth();

  useEffect(() => {
    if (!IS_NATIVE) return undefined;
    let sub;
    (async () => {
      const [{ App }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
        import('@capacitor/app'), import('@capacitor/status-bar'), import('@capacitor/splash-screen'),
      ]);
      StatusBar.setStyle({ style: Style.Light }).catch(() => {});
      SplashScreen.hide().catch(() => {});
      // A WhatsApp link like https://<site>/c/abc opens the app when it's installed
      sub = await App.addListener('appUrlOpen', ({ url }) => {
        try {
          const u = new URL(url);
          const path = u.pathname + u.search;
          if (APP_PATHS.test(u.pathname)) nav(path);
        } catch { /* ignore malformed */ }
      });
    })();
    return () => { sub?.remove(); };
  }, [nav]);

  const signedIn = !!me && !me.needs_profile;
  useEffect(() => {
    if (!IS_NATIVE || DEMO || !signedIn) return; // the demo has no server to send pushes
    startPush({
      register: (token, platform) => api.post('/me/devices', { token, platform }),
      navigate: nav,
    });
  }, [signedIn, nav]);

  return null;
}
