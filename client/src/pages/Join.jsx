import logoUrl from '../assets/logo.jpg';
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, Spinner } from '../auth.jsx';
import { Field, ErrorBox } from '../components/ui.jsx';
import ProfileWizard from '../components/ProfileWizard.jsx';
import { useMeta } from '../meta.js';
import { suggestEmail } from '../lib/emailTypos.js';

function AccountStep({ onDone }) {
  const meta = useMeta();
  const passwordOptional = meta?.mail_enabled === true;
  const [f, setF] = useState({ email: '', phone: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/signup', f);
      await onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const fe = error?.fields || {};
  // "gnail.com" and friends: offer the fix before she ends up with an address that never gets mail
  const meant = suggestEmail(f.email);

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <Field label="מייל" required error={meant ? null : fe.email}>
        <input type="email" dir="ltr" value={f.email} onChange={set('email')} autoComplete="email" />
        {meant && (
          <button type="button" className="email-fix" onClick={() => { setF({ ...f, email: meant }); setError(null); }}>
            התכוונת ל-<b dir="ltr">{meant}</b>? לחצי לתיקון
          </button>
        )}
      </Field>
      <Field label="טלפון נייד" required error={fe.phone}>
        <input type="tel" dir="ltr" value={f.phone} onChange={set('phone')} autoComplete="tel" placeholder="050-0000000" />
      </Field>
      <Field
        label={passwordOptional ? 'סיסמה (לא חובה)' : 'סיסמה'}
        required={!passwordOptional}
        error={fe.password}
        hint={passwordOptional ? 'אפשר לוותר. נשלח לך קישור כניסה למייל בכל פעם.' : '8 תווים לפחות. איתה תיכנסי בפעם הבאה.'}
      >
        <input type="password" dir="ltr" value={f.password} onChange={set('password')} autoComplete="new-password" />
      </Field>
      <ErrorBox error={error && !Object.keys(fe).length ? error : null} />
      {['email_taken', 'phone_taken'].includes(error?.code) && <p><Link to="/login">למעבר לכניסה ←</Link></p>}
      <button className="btn primary block" disabled={busy}>{busy ? 'רגע…' : 'המשך לפרופיל'}</button>
      <p className="center-text muted">כבר חברה? <Link to="/login">כניסה</Link></p>
    </form>
  );
}

export default function Join() {
  const { me, refresh } = useAuth();
  const [done, setDone] = useState(false);

  if (me === undefined) return <Spinner />;
  if (done) {
    return (
      <div className="narrow card center thanks">
        <img src={logoUrl} alt="" width="120" height="120" className="hero-logo sm" />
        <h1>תודה! 💛</h1>
        <p>נועה מאשרת חברות תוך 48 שעות. נעדכן אותך במייל.</p>
        <p className="spam-tip">
          📬 המיילים שלנו מגיעים מ-<bdi dir="ltr">club@mail.noaavital.co.il</bdi>.
          אם לא רואים אותם, כדאי לבדוק בתיקיית הספאם ולסמן ״לא ספאם״, כדי שהמיילים הבאים יגיעו לתיבה הראשית.
        </p>
        <Link className="btn primary" to="/dashboard">לאזור האישי</Link>
      </div>
    );
  }
  if (me && !me.needs_profile) return <Navigate to={me.user.role === 'admin' ? '/admin' : '/dashboard'} replace />;

  return (
    <div className="narrow">
      <h1 className="page-title">הצטרפות לקהילה</h1>
      {!me ? (
        <>
          <p className="lead-sm">כמה פרטים ונתחיל. ההרשמה לוקחת בערך 3 דקות.</p>
          <AccountStep onDone={refresh} />
        </>
      ) : (
        <ProfileWizard
          requireTerms
          terms={me.terms}
          submitLabel="סיום הרשמה"
          onSaved={async () => { setDone(true); await refresh(); }}
        />
      )}
    </div>
  );
}
