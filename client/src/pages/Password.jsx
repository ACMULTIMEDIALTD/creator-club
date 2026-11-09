import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Field, ErrorBox } from '../components/ui.jsx';

/** Set / change the password. After "forgot password" (signed in with an emailed code) the old one isn't needed. */
export default function Password() {
  const { me, refresh } = useAuth();
  const [params] = useSearchParams();
  const reset = params.get('reset') === '1';
  const needsCurrent = me.has_password && !me.can_reset_password;
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const home = me.user.role === 'admin' ? '/admin' : '/dashboard';

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('סיסמה של 8 תווים לפחות');
    if (password !== confirm) return setError('הסיסמאות לא תואמות');
    setBusy(true);
    try {
      await api.post('/auth/password', needsCurrent ? { password, current_password: current } : { password });
      await refresh();
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="narrow card center">
        <h1>הסיסמה נשמרה ✓</h1>
        <p>מעכשיו אפשר להיכנס עם המייל והסיסמה החדשה.</p>
        <Link to={home} className="btn primary">להמשך</Link>
      </div>
    );
  }

  return (
    <div className="narrow">
      <h1 className="page-title">{reset ? 'בחירת סיסמה חדשה' : me.has_password ? 'החלפת סיסמה' : 'בחירת סיסמה'}</h1>
      {reset && <p className="muted">נכנסת עם קוד מהמייל. עכשיו אפשר לבחור סיסמה חדשה.</p>}
      <form className="card form" onSubmit={submit}>
        {/* hidden username so password managers save the new password for the right account */}
        <input type="email" value={me.user.email} autoComplete="username" readOnly hidden />
        {needsCurrent && (
          <Field label="הסיסמה הנוכחית">
            <input type="password" dir="ltr" required value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </Field>
        )}
        <Field label="סיסמה חדשה" hint="8 תווים לפחות">
          <input type="password" dir="ltr" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus={!needsCurrent} />
        </Field>
        <Field label="אימות הסיסמה החדשה">
          <input type="password" dir="ltr" required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>
        <ErrorBox error={error} />
        <button className="btn primary block" disabled={busy}>{busy ? 'רגע…' : 'שמירת הסיסמה'}</button>
        {reset && <Link to={home} className="linklike center-text">דילוג, אבחר סיסמה אחר כך</Link>}
      </form>
    </div>
  );
}
