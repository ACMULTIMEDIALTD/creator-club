import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Spinner } from '../../auth.jsx';
import { fmtDate } from '../../labels.js';
import { Field, ErrorBox, Empty, ConfirmButton } from '../../components/ui.jsx';

const EMPTY = { name: '', contact_name: '', contact_phone: '', contact_email: '', agreement_signed_at: '', notes: '' };

function BrandForm({ initial, onSaved, onCancel }) {
  const [f, setF] = useState(initial ? { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, initial[k] ?? ''])), agreement_signed_at: initial.agreement_signed_at?.slice(0, 10) || '' } : EMPTY);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (initial) await api.patch(`/admin/brands/${initial.id}`, f); else await api.post('/admin/brands', f);
      onSaved();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const E = error?.fields || {};

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <Field label="שם המותג" required error={E.name}><input value={f.name} onChange={set('name')} autoFocus /></Field>
      <div className="row2">
        <Field label="איש/אשת קשר"><input value={f.contact_name} onChange={set('contact_name')} /></Field>
        <Field label="טלפון"><input dir="ltr" type="tel" value={f.contact_phone} onChange={set('contact_phone')} /></Field>
      </div>
      <div className="row2">
        <Field label="מייל"><input dir="ltr" type="email" value={f.contact_email} onChange={set('contact_email')} /></Field>
        <Field label="הסכם נחתם בתאריך"><input type="date" value={f.agreement_signed_at} onChange={set('agreement_signed_at')} /></Field>
      </div>
      <Field label="הערות"><textarea rows={3} value={f.notes} onChange={set('notes')} /></Field>
      <ErrorBox error={error && !Object.keys(E).length ? error : null} />
      <div className="wizard-nav">
        <button type="button" className="btn ghost" onClick={onCancel}>ביטול</button>
        <button className="btn primary grow" disabled={busy}>שמירה</button>
      </div>
    </form>
  );
}

export default function AdminBrands() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | brand

  const load = () => api.get('/admin/brands').then((r) => setRows(r.brands)).catch(setError);
  useEffect(() => { load(); }, []);

  const remove = async (b) => {
    try { await api.del(`/admin/brands/${b.id}`); await load(); } catch (e) { setError(e); }
  };

  return (
    <div className="narrow wide-sm">
      <div className="page-head">
        <h1 className="page-title">מותגים</h1>
        {!editing && <button className="btn primary" onClick={() => setEditing('new')}>+ מותג חדש</button>}
      </div>
      <ErrorBox error={error} />
      {editing && (
        <BrandForm initial={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
      {!rows ? <Spinner /> : !rows.length ? <Empty>עוד אין מותגים.</Empty> : (
        <ul className="list">
          {rows.map((b) => (
            <li key={b.id} className="list-row">
              <span className="grow">
                <b>{b.name}</b>
                <span className="muted small block">
                  {[b.contact_name, b.contact_phone, b.contact_email].filter(Boolean).join(' · ') || 'אין פרטי קשר'}
                  {' · '}{b.agreement_signed_at ? `הסכם נחתם ${fmtDate(b.agreement_signed_at)}` : <span className="warn">אין הסכם חתום</span>}
                  {' · '}{b.campaign_count} קמפיינים
                </span>
              </span>
              <button className="btn ghost sm" onClick={() => setEditing(b)}>עריכה</button>
              {!b.campaign_count && <ConfirmButton ask={`למחוק את ${b.name}?`} onConfirm={() => remove(b)}>מחיקה</ConfirmButton>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
