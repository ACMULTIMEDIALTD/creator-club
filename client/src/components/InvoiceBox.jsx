import { useState } from 'react';
import { api, assetUrl } from '../api.js';
import { BANKS, DOC_TYPES, fmtDate, fmtNum } from '../labels.js';
import { Field, ErrorBox } from './ui.jsx';
import { resizeImage } from '../lib/resizeImage.js';

const MAX_MB = 8;
const mask = (n) => (n && n.length > 3 ? `•••${n.slice(-3)}` : n);

/** Bank details + the uploaded document, as a short summary. */
function InvoiceSummary({ inv }) {
  return (
    <dl className="facts invoice-facts">
      <div><dt>מסמך</dt><dd>{DOC_TYPES[inv.doc_type]}</dd></div>
      <div><dt>סכום</dt><dd>₪{fmtNum(inv.amount_ils)}</dd></div>
      <div><dt>חשבון</dt><dd>{inv.bank_name} · סניף <bdi dir="ltr">{inv.branch}</bdi> · חשבון <bdi dir="ltr">{mask(inv.account_number)}</bdi></dd></div>
      <div><dt>הועלה</dt><dd>{fmtDate(inv.uploaded_at)} · <a href={assetUrl(inv.file_url)} target="_blank" rel="noreferrer">צפייה בקובץ</a></dd></div>
    </dl>
  );
}

function InvoiceForm({ applicationId, payment, onSaved, onCancel }) {
  const inv = payment.invoice;
  const start = inv || payment.saved_bank || {};
  const [f, setF] = useState({
    doc_type: inv?.doc_type || '',
    amount_ils: inv?.amount_ils ?? '',
    account_holder: start.account_holder || '',
    bank_name: start.bank_name || '',
    branch: start.branch || '',
    account_number: start.account_number || '',
  });
  // Saving to the profile is her choice; already-saved details stay ticked
  const [saveBank, setSaveBank] = useState(!!payment.saved_bank);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const E = error?.fields || {};
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const pickFile = (e) => {
    const picked = e.target.files?.[0];
    setError(null);
    if (picked && picked.type === 'application/pdf' && picked.size > MAX_MB * 1024 * 1024) {
      setError(`הקובץ גדול מדי (עד ${MAX_MB}MB)`);
      return;
    }
    setFile(picked || null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file && !inv) return setError({ message: 'יש לצרף את החשבונית', fields: { file: 'יש לצרף את החשבונית' } });
    setBusy(true);
    setError(null);
    try {
      let fileId;
      if (file) {
        // Phone photos are shrunk first; PDFs go as they are
        const blob = file.type.startsWith('image/') ? await resizeImage(file, { maxSide: 2200, quality: 0.9 }) : file;
        fileId = (await api.upload(`/me/invoice-files?name=${encodeURIComponent(file.name)}`, blob)).id;
      }
      await api.put(`/me/applications/${applicationId}/invoice`, { ...f, ...(fileId ? { file_id: fileId } : {}), save_bank: saveBank });
      await onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form invoice-form" onSubmit={submit} noValidate>
      <Field label="סוג המסמך" error={E.doc_type} required>
        <select value={f.doc_type} onChange={set('doc_type')} required>
          <option value="">בחירה…</option>
          {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="סכום (₪)" error={E.amount_ils} required>
        <input type="number" inputMode="decimal" min="1" step="0.01" dir="ltr" value={f.amount_ils} onChange={set('amount_ils')} required />
      </Field>
      <Field label="הקובץ (PDF או צילום)" error={E.file} hint={inv && !file ? `הקובץ הנוכחי נשאר אם לא בוחרים חדש` : `עד ${MAX_MB}MB`} required={!inv}>
        <input type="file" accept="application/pdf,image/*" onChange={pickFile} />
      </Field>

      <h3>פרטי חשבון הבנק לתשלום</h3>
      {payment.saved_bank && !inv && <p className="small muted">מילאנו את הפרטים השמורים בפרופיל שלך. אפשר לשנות.</p>}
      <Field label="שם בעל/ת החשבון" error={E.account_holder} required>
        <input value={f.account_holder} onChange={set('account_holder')} autoComplete="name" required />
      </Field>
      <Field label="בנק" error={E.bank_name} required>
        <input list="banks" value={f.bank_name} onChange={set('bank_name')} required />
        <datalist id="banks">{BANKS.map((b) => <option key={b} value={b} />)}</datalist>
      </Field>
      <div className="row2">
        <Field label="סניף" error={E.branch} required>
          <input inputMode="numeric" dir="ltr" maxLength={4} value={f.branch} onChange={set('branch')} required />
        </Field>
        <Field label="מספר חשבון" error={E.account_number} required>
          <input inputMode="numeric" dir="ltr" maxLength={20} value={f.account_number} onChange={set('account_number')} required />
        </Field>
      </div>

      <fieldset className="save-choice">
        <legend className="field-label">לשמור את פרטי הבנק?</legend>
        <label className="radio"><input type="radio" name="save_bank" checked={saveBank} onChange={() => setSaveBank(true)} /> כן, לשמור בפרופיל שלי לפעם הבאה</label>
        <label className="radio"><input type="radio" name="save_bank" checked={!saveBank} onChange={() => setSaveBank(false)} /> לא, רק לתשלום הזה</label>
      </fieldset>

      <ErrorBox error={error} />
      <button className="btn primary block" disabled={busy}>{busy ? 'מעלה…' : inv ? 'שמירת השינויים' : 'שליחת החשבונית'}</button>
      {onCancel && <button type="button" className="btn ghost block" onClick={onCancel}>ביטול</button>}
    </form>
  );
}

/** On the campaign page, once Noa approved the video of a paid campaign. */
export default function InvoiceBox({ applicationId, payment, onChange }) {
  const [editing, setEditing] = useState(false);
  const inv = payment.invoice;

  if (payment.paid_at) {
    return (
      <div className="card invoice-card">
        <h2>התשלום הועבר 💸</h2>
        <p>נועה סימנה שהתשלום הועבר ב-{fmtDate(payment.paid_at)}.</p>
        {inv && <InvoiceSummary inv={inv} />}
      </div>
    );
  }
  if (inv && !editing) {
    return (
      <div className="card invoice-card">
        <h2>החשבונית התקבלה ✓</h2>
        <p>התשלום יועבר לפי תנאי הקהילה. נשלח לך מייל כשהוא יוצא.</p>
        <InvoiceSummary inv={inv} />
        <button className="btn ghost sm" onClick={() => setEditing(true)}>עדכון החשבונית או הפרטים</button>
      </div>
    );
  }
  return (
    <div className="card invoice-card">
      <h2>הסרטון אושר ✓ עכשיו חשבונית</h2>
      {!inv && <p>כדי לקבל את התשלום, העלי <b>חשבונית עסקה, חשבונית מס או קבלה</b> על הסכום שסוכם, ומלאי את פרטי חשבון הבנק.</p>}
      <InvoiceForm
        applicationId={applicationId}
        payment={payment}
        onSaved={async () => { setEditing(false); await onChange(); }}
        onCancel={inv ? () => setEditing(false) : null}
      />
    </div>
  );
}
