import BuiltBy from '../components/BuiltBy.jsx';
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import logoUrl from '../assets/logo.jpg';
import { IS_NATIVE } from '../native/platform.js';
import {
  isAndroid, isInAppBrowser, isIos, isStandalone, chromeIntentUrl, safariUrl, useInstallPrompt,
} from '../lib/installEnv.js';

// Small inline icons that look like the real buttons on the phone
const ShareIcon = () => (
  <svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
);
const PlusSquareIcon = () => (
  <svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
);
const DotsIcon = () => (
  <svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2" fill="currentColor" /><circle cx="12" cy="12" r="2" fill="currentColor" /><circle cx="12" cy="19" r="2" fill="currentColor" /></svg>
);
const CompassIcon = () => (
  <svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M15.5 8.5l-2 5-5 2 2-5z" fill="currentColor" /></svg>
);

function Step({ n, children }) {
  return (
    <li className="install-step">
      <span className="num">{n}</span>
      <div>{children}</div>
    </li>
  );
}

function IphoneSteps({ inApp }) {
  return (
    <ol className="install-steps">
      <Step n={1}>
        <b>פותחים ב-Safari.</b> אם הקישור נפתח מתוך ווטסאפ או אינסטגרם, לוחצים על סמל ה-Safari <CompassIcon /> בפינה התחתונה,
        או על ⋯ ואז <b>״פתיחה ב-Safari״</b>.
        {inApp && <div><a className="btn primary sm" href={safariUrl('/install')}>פתיחה ב-Safari</a></div>}
      </Step>
      <Step n={2}>לוחצים על כפתור <b>השיתוף</b> <ShareIcon /> בתחתית המסך (ריבוע עם חץ למעלה).</Step>
      <Step n={3}>גוללים מעט למטה ובוחרים <b>״הוספה למסך הבית״</b> <PlusSquareIcon />.</Step>
      <Step n={4}>לוחצים <b>״הוספה״</b> בפינה. האייקון של The Creator Club יופיע במסך הבית 🎉</Step>
    </ol>
  );
}

function AndroidSteps({ inApp, canInstall, install }) {
  return (
    <ol className="install-steps">
      {canInstall && (
        <li className="install-step one-tap">
          <button className="btn primary block lg" onClick={install}>התקנה בלחיצה אחת</button>
        </li>
      )}
      <Step n={1}>
        <b>פותחים ב-Chrome.</b> אם הקישור נפתח מתוך ווטסאפ או אינסטגרם, לוחצים על <DotsIcon /> למעלה ובוחרים <b>״פתיחה ב-Chrome״</b>.
        {inApp && <div><a className="btn primary sm" href={chromeIntentUrl('/install')}>פתיחה ב-Chrome</a></div>}
      </Step>
      <Step n={2}>ב-Chrome לוחצים על <DotsIcon /> בפינה העליונה.</Step>
      <Step n={3}>בוחרים <b>״הוספה למסך הבית״</b> או <b>״התקנת האפליקציה״</b>.</Step>
      <Step n={4}>לוחצים <b>״התקנה״</b>. האייקון של The Creator Club יופיע במסך הבית 🎉</Step>
    </ol>
  );
}

/** Public step-by-step guide for adding the site to the home screen. Noa pins this link in the WhatsApp group. */
export default function Install() {
  const [tab, setTab] = useState(() => (isAndroid() ? 'android' : 'iphone'));
  const [canInstall, install] = useInstallPrompt();
  const [done, setDone] = useState(false);

  // Opened from a home-screen icon that was saved on this page → go to the app itself
  if (IS_NATIVE || isStandalone()) return <Navigate to="/dashboard" replace />;

  const inApp = isInAppBrowser();
  const doInstall = async () => { if (await install()) setDone(true); };

  return (
    <div className="landing narrow install-page">
      <div className="landing-top"><Link to="/dashboard" className="linklike">→ לאזור האישי</Link></div>
      <img src={logoUrl} alt="" className="hero-logo sm" width="120" height="120" />
      <h1>הקהילה במסך הבית</h1>
      <p className="lead">כך הקהילה נפתחת בלחיצה, במסך מלא, כמו אפליקציה.</p>

      {done ? (
        <div className="card center"><h2>נוסף למסך הבית 🎉</h2><p>מעכשיו נכנסים מהאייקון.</p></div>
      ) : (
        <div className="card">
          <div className="tabs install-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'iphone'} className={tab === 'iphone' ? 'on' : ''} onClick={() => setTab('iphone')}>אייפון</button>
            <button role="tab" aria-selected={tab === 'android'} className={tab === 'android' ? 'on' : ''} onClick={() => setTab('android')}>אנדרואיד</button>
          </div>
          {tab === 'iphone'
            ? <IphoneSteps inApp={inApp && isIos()} />
            : <AndroidSteps inApp={inApp && isAndroid()} canInstall={canInstall} install={doInstall} />}
        </div>
      )}
      <footer className="landing-footer"><BuiltBy /></footer>
    </div>
  );
}
