import { useState } from 'react';
import { DEMO } from '../demo/flag.js';
import { IS_NATIVE } from '../native/platform.js';
import { TYPE_LABELS, APP_STATUS, APP_STATUS_ADMIN, CAMPAIGN_STATUS, USER_STATUS } from '../labels.js';

export function Field({ label, error, hint, children, required }) {
  return (
    <label className={`field${error ? ' has-error' : ''}`}>
      <span className="field-label">{label}{required && <span className="req"> *</span>}</span>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export const TypeBadge = ({ type }) => <span className={`badge type-${type}`}>{TYPE_LABELS[type]}</span>;
export const AppStatusChip = ({ status, admin }) => (
  <span className={`chip app-${status}`}>{(admin ? APP_STATUS_ADMIN : APP_STATUS)[status]}</span>
);
export const CampaignStatusChip = ({ status }) => <span className={`chip camp-${status}`}>{CAMPAIGN_STATUS[status]}</span>;
export const UserStatusChip = ({ status }) => <span className={`chip user-${status}`}>{USER_STATUS[status]}</span>;

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="alert error" role="alert">{typeof error === 'string' ? error : error.message}</div>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function igUrl(handle) { return handle ? `https://instagram.com/${handle}` : null; }
export function ttUrl(handle) { return handle ? `https://tiktok.com/@${handle}` : null; }

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-ui" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

/** Two-step button: replaces window.confirm(), which embedded viewers block. */
export function ConfirmButton({ ask, onConfirm, className = 'btn ghost sm', disabled, children }) {
  const [asking, setAsking] = useState(false);
  if (!ask) return <button className={className} disabled={disabled} onClick={onConfirm}>{children}</button>;
  if (!asking) return <button className={className} disabled={disabled} onClick={() => setAsking(true)}>{children}</button>;
  return (
    <span className="confirm-inline" role="group">
      <span>{ask}</span>
      <button className="btn sm primary" disabled={disabled} onClick={() => { setAsking(false); onConfirm(); }}>כן</button>
      <button className="btn sm ghost" onClick={() => setAsking(false)}>לא</button>
    </span>
  );
}

/** CSV download link. The demo build has no server to download from, so it explains instead. */
export function DownloadLink({ href, className, children }) {
  const [note, setNote] = useState(false);
  if (!DEMO && !IS_NATIVE) return <a className={className} href={href}>{children}</a>;
  return (
    <>
      <button type="button" className={className} onClick={() => setNote(true)}>{children}</button>
      {note && (
        <span className="small muted">
          {DEMO ? 'בגרסת ההדגמה אין הורדת קבצים. באתר האמיתי יורד קובץ שנפתח באקסל.' : 'ייצוא קבצים זמין באתר, מהמחשב.'}
        </span>
      )}
    </>
  );
}
