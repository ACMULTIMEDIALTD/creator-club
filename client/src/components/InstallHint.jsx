import { useState } from 'react';
import { Link } from 'react-router-dom';
import logoUrl from '../assets/logo.jpg';
import { DEMO } from '../demo/flag.js';
import { IS_NATIVE } from '../native/platform.js';
import { isAndroid, isInAppBrowser, isIos, isMobile, isStandalone, chromeIntentUrl, useInstallPrompt } from '../lib/installEnv.js';

const KEY = 'install_hint_dismissed';
const dismissed = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

/** Suggests adding the site to the home screen when a creator opens it in a phone browser. */
export default function InstallHint() {
  const [canInstall, install] = useInstallPrompt();
  const [hidden, setHidden] = useState(() => IS_NATIVE || DEMO || dismissed() || isStandalone() || !isMobile());

  const close = () => {
    setHidden(true);
    try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
  };

  if (hidden) return null;
  const inApp = isInAppBrowser();

  return (
    <div className="install-hint" role="note">
      <img src={logoUrl} alt="" />
      <div className="grow">
        <b>להוסיף את הקהילה למסך הבית?</b>
        {canInstall && <p>כניסה בלחיצה אחת, כמו אפליקציה.</p>}
        {!canInstall && inApp && <p>הדף נפתח בתוך אפליקציה אחרת. קודם פותחים אותו ב-{isIos() ? 'Safari' : 'Chrome'}.</p>}
        {!canInstall && !inApp && <p>שתי לחיצות, ומקבלים אייקון כמו של אפליקציה.</p>}
        <div className="row-inline">
          {canInstall && <button className="btn primary sm" onClick={async () => { if (await install()) close(); }}>הוספה</button>}
          {!canInstall && inApp && isAndroid() && <a className="btn primary sm" href={chromeIntentUrl()}>פתיחה ב-Chrome</a>}
          <Link to="/install" className="btn ghost sm">איך עושים את זה?</Link>
        </div>
      </div>
      <button className="icon-btn" onClick={close} aria-label="סגירה">×</button>
    </div>
  );
}
