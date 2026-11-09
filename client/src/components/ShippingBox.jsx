import { useState } from 'react';
import { api } from '../api.js';
import { fmtDate } from '../labels.js';
import { Field, ErrorBox } from './ui.jsx';

const line = (a) => [a.address_street, a.address_apt, a.address_city, a.address_zip].filter(Boolean).join(', ');

/** Selected for a campaign with a product: confirm (or fix) where to ship it. */
export default function ShippingBox({ applicationId, shipping, onChange }) {
  const [f, setF] = useState(() => ({
    address_street: '', address_apt: '', address_city: '', address_zip: '',
    ...Object.fromEntries(Object.entries(shipping.address || {}).map(([k, v]) => [k, v || ''])),
  }));
  const [editing, setEditing] = useState(!shipping.address?.address_street);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const E = error?.fields || {};
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put(`/me/applications/${applicationId}/address`, f);
      setEditing(false);
      await onChange();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (shipping.confirmed_at && !editing) {
    return (
      <div className="card">
        <h2>📦 המוצר יישלח אל</h2>
        <div className="ship-address">{shipping.shipping_address}</div>
        <p className="small muted">אישרת את הכתובת ב-{fmtDate(shipping.confirmed_at)}.</p>
        <button className="btn ghost sm" onClick={() => setEditing(true)}>שינוי כתובת</button>
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="card">
        <h2>📦 לאן לשלוח את המוצר?</h2>
        <p>בקמפיין הזה נשלח אלייך מוצר. זו הכתובת שבפרופיל שלך. היא נכונה?</p>
        <div className="ship-address">{line(f)}</div>
        <ErrorBox error={error} />
        <div className="row-inline">
          <button className="btn primary" disabled={busy} onClick={() => save()}>{busy ? 'רגע…' : 'כן, הכתובת נכונה ✓'}</button>
          <button className="btn ghost" onClick={() => setEditing(true)}>לא, לעדכון</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>📦 כתובת למשלוח המוצר</h2>
      <form className="form" onSubmit={save} noValidate>
        <Field label="רחוב ומספר בית" required error={E.address_street}>
          <input value={f.address_street} onChange={set('address_street')} autoComplete="address-line1" />
        </Field>
        <div className="row2">
          <Field label="דירה / קומה / כניסה" error={E.address_apt}>
            <input value={f.address_apt} onChange={set('address_apt')} autoComplete="address-line2" />
          </Field>
          <Field label="עיר" required error={E.address_city}>
            <input value={f.address_city} onChange={set('address_city')} autoComplete="address-level2" />
          </Field>
        </div>
        <Field label="מיקוד" error={E.address_zip}>
          <input inputMode="numeric" dir="ltr" maxLength={7} value={f.address_zip} onChange={set('address_zip')} autoComplete="postal-code" />
        </Field>
        <p className="small muted">הכתובת תתעדכן גם בפרופיל שלך.</p>
        <ErrorBox error={error && !Object.keys(E).length ? error : null} />
        <button className="btn primary block" disabled={busy}>{busy ? 'שומרת…' : 'אישור הכתובת'}</button>
        {shipping.address?.address_street && <button type="button" className="btn ghost block" onClick={() => setEditing(false)}>ביטול</button>}
      </form>
    </div>
  );
}
