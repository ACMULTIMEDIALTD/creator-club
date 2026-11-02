import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Spinner } from '../../auth.jsx';
import { fmtDate, fmtDateTime } from '../../labels.js';
import { Field, ErrorBox, ConfirmButton } from '../../components/ui.jsx';

/** Who can manage the community: add an admin (temporary password shown once), remove one. */
export default function AdminTeam() {
  const [admins, setAdmins] = useState(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(null); // { email, password }
  const [copied, setCopied] = useState(false);

  const load = () => api.get('/admin/admins').then((r) => setAdmins(r.admins)).catch(setError);
  useEffect(() => { load(); }, []);

  const add = async (e, promote = false) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post('/admin/admins', { email: email.trim(), ...(promote ? { promote: true } : {}) });
      setAdded({ email: r.admin.email, password: r.password });
      setCopied(false);
      setEmail('');
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    setError(null);
    try { await api.del(`/admin/admins/${id}`); await load(); } catch (err) { setError(err); }
  };

  const shareText = added && `הוספתי אותך לצוות הניהול של The Creator Club 👋\nכניסה: ${window.location.origin}/login\nמייל: ${added.email}\nסיסמה זמנית: ${added.password}\n(אחרי הכניסה אפשר להחליף סיסמה)`;

  if (!admins) return error ? <ErrorBox error={error} /> : <Spinner />;
  return (
    <div className="narrow">
      <h1 className="page-title">צוות ניהול</h1>
      <p className="muted">מנהלים רואים ועושים הכול במערכת: יוצרות, קמפיינים, תשלומים וייצוא. כדאי להוסיף רק אנשים שסומכים עליהם.</p>

      <ul className="list">
        {admins.map((a) => (
          <li key={a.id} className="list-row">
            <span className="grow">
              <b dir="ltr">{a.email}</b>{a.me && <span className="muted"> (את/ה)</span>}
              <span className="muted small block">נוסף/ה {fmtDate(a.created_at)} · כניסה אחרונה {a.last_login_at ? fmtDateTime(a.last_login_at) : 'עוד לא נכנס/ה'}</span>
            </span>
            {!a.me && <ConfirmButton ask="להסיר את ההרשאה?" onConfirm={() => remove(a.id)}>הסרה</ConfirmButton>}
          </li>
        ))}
      </ul>

      {added ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>נוסף/ה ✓</h2>
          <p>הסיסמה הזמנית של <b dir="ltr">{added.email}</b>. היא מוצגת רק עכשיו:</p>
          <p className="center-text"><code dir="ltr" className="temp-pass">{added.password}</code></p>
          <div className="row-inline">
            <a className="btn whatsapp sm" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}>שליחה בווטסאפ</a>
            <button className="btn ghost sm" onClick={async () => { try { await navigator.clipboard.writeText(shareText); setCopied(true); } catch { /* select it by hand */ } }}>{copied ? 'הועתק ✓' : 'העתקה'}</button>
            <button className="btn ghost sm" onClick={() => setAdded(null)}>סגירה</button>
          </div>
          <p className="small muted">נשלח גם מייל עם קישור כניסה. אפשר להיכנס עם הסיסמה או עם קוד למייל.</p>
        </div>
      ) : (
        <form className="card form" onSubmit={add} noValidate>
          <h2 style={{ marginTop: 0 }}>הוספת מנהל/ת</h2>
          <Field label="מייל" error={error?.fields?.email}>
            <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </Field>
          {error?.code === 'is_creator' && (
            <div className="alert">
              המייל הזה רשום כיוצרת בקהילה. להפוך את החשבון למנהל/ת?
              <div className="row-inline" style={{ marginTop: 8 }}>
                <button type="button" className="btn primary sm" disabled={busy} onClick={(e) => add(e, true)}>כן, להפוך למנהל/ת</button>
              </div>
            </div>
          )}
          <ErrorBox error={error && !error.fields?.email ? error : null} />
          <button className="btn primary block" disabled={busy || !email.trim()}>{busy ? 'מוסיף…' : 'הוספה'}</button>
        </form>
      )}
    </div>
  );
}
