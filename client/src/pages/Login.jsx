import { DEMO } from '../demo/flag.js';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Field, ErrorBox } from '../components/ui.jsx';
import { useMeta } from '../meta.js';

const safeNext = (n) => (n && /^\/(?![/\\])/.test(n) ? n : null);

export default function Login() {
  const { me, refresh } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [forgot, setForgot] = useState(false);
  // "Forgot password": sign in with an emailed code, then land on the new-password screen
  const next = forgot ? '/password?reset=1' : safeNext(params.get('next'));
  const meta = useMeta();
  const mailEnabled = meta?.mail_enabled !== false;
  const [chosenMode, setMode] = useState('magic'); // creators hate passwords
  // Until email is set up on the server, sign-in links can't be sent: password only
  const mode = mailEnabled ? chosenMode : 'password';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState(params.get('error') === 'link_expired' ? 'הקישור פג תוקף או שכבר נעשה בו שימוש. אפשר לבקש קישור חדש.' : null);

  if (me) return <Navigate to={next || (me.user.role === 'admin' ? '/admin' : '/dashboard')} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'magic') {
        const r = await api.post('/auth/login', next ? { email, next } : { email });
        if (r.demo_logged_in) {
          await refresh();
          return;
        }
        setSent(true);
      } else {
        await api.post('/auth/login', { email, password });
        await refresh();
        nav(next || '/dashboard', { replace: true });
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  // Typing the code keeps the creator inside the home-screen app (a tapped link opens the browser)
  const submitCode = async (value = code) => {
    if (!/^\d{6}$/.test(value)) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/code', { email, code: value });
      await refresh();
      nav(next || '/dashboard', { replace: true });
    } catch (err) {
      setError(err);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="narrow card center code-step">
        <h1>בדקי את המייל 💌</h1>
        {forgot && <p>אחרי הכניסה עם הקוד תוכלי לבחור סיסמה חדשה.</p>}
        <p>אם <b dir="ltr">{email}</b> רשום אצלנו, שלחנו אלייך <b>קוד כניסה</b> בן 6 ספרות. הקלידי אותו כאן:</p>
        <form onSubmit={(e) => { e.preventDefault(); submitCode(); }}>
          <input
            className="code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            dir="ltr"
            autoFocus
            aria-label="קוד כניסה"
            placeholder="••••••"
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 6);
              setCode(v);
              if (v.length === 6) submitCode(v); // auto-submit, also when iOS fills the code from Mail
            }}
          />
          <ErrorBox error={error} />
          <button className="btn primary block" disabled={busy || code.length !== 6}>{busy ? 'רגע…' : 'כניסה'}</button>
        </form>
        <p className="muted small">אפשר גם ללחוץ על הכפתור במייל. הוא יפתח את האתר בדפדפן.</p>
        <p className="muted small">לא הגיע? כדאי לבדוק בתיקיית הספאם ולסמן ״לא ספאם״, כדי שהמייל הבא יגיע לתיבה הראשית.</p>
        <button className="btn ghost sm" onClick={() => { setSent(false); setCode(''); setError(null); }}>שליחת קוד חדש</button>
      </div>
    );
  }

  return (
    <div className="narrow">
      <h1 className="page-title">{forgot ? 'שכחתי סיסמה' : 'כניסה לקהילה'}</h1>
      {forgot && <p className="muted">נשלח לך קוד למייל. נכנסים איתו ובוחרים סיסמה חדשה.</p>}
      {DEMO && <p className="demo-hint">בהדגמה אין מיילים: מספיק להקליד מייל ולהיכנס, או להשתמש בכפתורים בפס העליון.</p>}
      <form className="card form" onSubmit={submit}>
        <Field label="מייל">
          <input type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
        </Field>
        {mode === 'password' && (
          <Field label="סיסמה">
            <input type="password" dir="ltr" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
        )}
        <ErrorBox error={error} />
        <button className="btn primary block" disabled={busy}>
          {busy ? 'רגע…' : mode === 'magic' ? (forgot ? 'שלחו לי קוד לאיפוס' : 'שלחו לי קוד כניסה למייל') : 'כניסה'}
        </button>
        {mailEnabled && mode === 'password' && (
          <button type="button" className="linklike center-text" onClick={() => { setForgot(true); setMode('magic'); setError(null); }}>
            שכחתי סיסמה
          </button>
        )}
        {mailEnabled && (
          <button type="button" className="linklike center-text" onClick={() => { setForgot(false); setMode(mode === 'magic' ? 'password' : 'magic'); }}>
            {mode === 'magic' ? 'כניסה עם סיסמה' : 'כניסה עם קוד למייל (בלי סיסמה)'}
          </button>
        )}
        {!mailEnabled && <p className="small muted center-text">שכחת סיסמה? כתבי לנועה בווטסאפ.</p>}
      </form>
      <p className="center-text">עדיין לא בקהילה? <Link to="/join">להרשמה</Link></p>
    </div>
  );
}
