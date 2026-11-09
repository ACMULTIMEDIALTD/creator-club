import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Spinner } from '../../auth.jsx';
import { suggestEmail } from '../../lib/emailTypos.js';
import { BILLING, GENDER, USER_STATUS, TIERS, fmtNum, fmtDate, fmtDateTime } from '../../labels.js';
import { ErrorBox, AppStatusChip, ConfirmButton, igUrl, ttUrl } from '../../components/ui.jsx';

const EVENT_LABELS = {
  signup: 'נרשמה', login: 'התחברה', profile_created: 'השלימה פרופיל', profile_updated: 'עדכנה פרופיל',
  terms_accepted: 'אישרה תנאים', campaign_viewed: 'צפתה בקמפיין', applied: 'הגישה מועמדות', withdrawn: 'ביטלה מועמדות',
};

/** The creator's email, with a pencil to fix a typo (otherwise she never gets codes or emails). */
function EmailEdit({ email, saving, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(email);
  const meant = suggestEmail(email);
  if (!editing) {
    return (
      <>
        <a href={`mailto:${email}`} dir="ltr">{email}</a>{' '}
        <button type="button" className="linklike small" onClick={() => { setValue(meant || email); setEditing(true); }} aria-label="עריכת מייל">✏️</button>
        {meant && <span className="email-typo"> נראה כמו טעות הקלדה</span>}
      </>
    );
  }
  return (
    <span className="email-edit">
      <input type="email" dir="ltr" value={value} onChange={(e) => setValue(e.target.value)} aria-label="מייל" />
      <button type="button" className="btn sm primary" disabled={saving || !value.trim()} onClick={async () => { await onSave(value.trim()); setEditing(false); }}>שמירה</button>
      <button type="button" className="btn sm ghost" onClick={() => setEditing(false)}>ביטול</button>
    </span>
  );
}

export default function CreatorDrawer({ id, meta, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [tempPassword, setTempPassword] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = () => api.get(`/admin/creators/${id}`).then((d) => { setData(d); setNotes(d.profile?.admin_notes || ''); }).catch(setError);
  useEffect(() => { setData(null); load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const patch = async (body) => {
    setSaving(true);
    setError(null);
    try { await api.patch(`/admin/creators/${id}`, body); await load(); onChanged(); } catch (e) { setError(e); } finally { setSaving(false); }
  };

  const resetPassword = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await api.post(`/admin/creators/${id}/reset-password`);
      setTempPassword(r.password);
      setCopied(false);
    } catch (e) { setError(e); } finally { setSaving(false); }
  };
  const copyPassword = async () => {
    try { await navigator.clipboard.writeText(tempPassword); setCopied(true); } catch { /* user can select it */ }
  };

  const u = data?.user;
  const p = data?.profile;
  const regionName = p && meta?.regions.find((r) => r.id === p.region_id)?.name;
  const nicheNames = p && meta ? p.niche_ids.map((nid) => meta.niches.find((n) => n.id === nid)?.name).filter(Boolean) : [];

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label="פרופיל יוצרת">
        <button className="icon-btn close" onClick={onClose} aria-label="סגירה">×</button>
        <ErrorBox error={error} />
        {!data ? <Spinner /> : (
          <>
            <h2>{p?.full_name || u.email}</h2>
            <div className="creator-code" title="הקוד שמופיע בקובץ ללקוחות">קוד: <bdi dir="ltr">C-{u.id.replace(/-/g, '').slice(0, 6).toUpperCase()}</bdi></div>
            <div className="muted small">
              <EmailEdit email={u.email} saving={saving} onSave={(email) => patch({ email })} /> · <a href={`https://wa.me/972${(u.phone || '').replace(/^0/, '')}`} target="_blank" rel="noreferrer" dir="ltr">{u.phone}</a>
              <br />נרשמה {fmtDate(u.created_at)} · כניסה אחרונה {fmtDateTime(u.last_login_at)}
            </div>

            <div className="drawer-controls">
              <label>סטטוס
                <select value={u.status} disabled={saving} onChange={(e) => patch({ status: e.target.value })}>
                  {Object.entries(USER_STATUS).map(([k, v]) => <option key={k} value={k} disabled={k === 'active' && !p}>{v}</option>)}
                </select>
              </label>
              {p && (
                <>
                  <label>דרגה
                    <select value={p.tier} disabled={saving} onChange={(e) => patch({ tier: e.target.value })}>
                      {Object.entries(TIERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </label>
                  <label>דירוג
                    <select value={p.internal_rating ?? ''} disabled={saving} onChange={(e) => patch({ internal_rating: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">—</option>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
                    </select>
                  </label>
                </>
              )}
            </div>
            {u.status === 'pending' && p && <button className="btn primary block" disabled={saving} onClick={() => patch({ status: 'active' })}>אישור חברות</button>}

            {tempPassword ? (
              <div className="temp-password">
                <p>סיסמה חדשה ל{p?.full_name?.split(' ')[0] || 'יוצרת'}. שלחי לה אותה בווטסאפ. הסיסמה מוצגת רק עכשיו.</p>
                <div className="row-inline">
                  <code dir="ltr">{tempPassword}</code>
                  <button type="button" className="btn ghost sm" onClick={copyPassword}>{copied ? 'הועתק ✓' : 'העתקה'}</button>
                  {u.phone && (
                    <a className="btn whatsapp sm" target="_blank" rel="noreferrer"
                      href={`https://wa.me/972${u.phone.replace(/^0/, '')}?text=${encodeURIComponent(`הסיסמה החדשה שלך לקהילה: ${tempPassword}\nכניסה עם המייל ${u.email}`)}`}>
                      שליחה בווטסאפ
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <ConfirmButton className="btn ghost sm" disabled={saving} ask="ליצור לה סיסמה חדשה? הסיסמה הקודמת תפסיק לעבוד." onConfirm={resetPassword}>
                איפוס סיסמה
              </ConfirmButton>
            )}

            {!p ? <p className="alert">היוצרת נרשמה ועדיין לא השלימה פרופיל.</p> : (
              <>
                <h3>הערות פנימיות</h3>
                <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                {notes !== (p.admin_notes || '') && <button className="btn sm primary" disabled={saving} onClick={() => patch({ admin_notes: notes || null })}>שמירת הערות</button>}

                <h3>רשתות</h3>
                <dl className="kv">
                  {p.instagram_handle && <><dt>אינסטגרם</dt><dd><a href={igUrl(p.instagram_handle)} target="_blank" rel="noreferrer" dir="ltr">@{p.instagram_handle}</a> · {fmtNum(p.instagram_followers)}</dd></>}
                  {p.tiktok_handle && <><dt>טיקטוק</dt><dd><a href={ttUrl(p.tiktok_handle)} target="_blank" rel="noreferrer" dir="ltr">@{p.tiktok_handle}</a> · {fmtNum(p.tiktok_followers)}</dd></>}
                  {p.youtube_url && <><dt>יוטיוב</dt><dd><a href={p.youtube_url} target="_blank" rel="noreferrer">ערוץ</a></dd></>}
                  {p.other_platforms && <><dt>אחר</dt><dd>{p.other_platforms}</dd></>}
                </dl>

                <h3>פרטים וקהל</h3>
                <dl className="kv">
                  <dt>עיר</dt><dd>{p.city || '—'}{regionName ? ` (${regionName})` : ''}</dd>
                  <dt>שנת לידה</dt><dd>{p.birth_year || '—'}</dd>
                  <dt>תחומים</dt><dd>{nicheNames.join(', ') || '—'}</dd>
                  <dt>קהל</dt><dd>{GENDER[p.audience_gender] || '—'}{p.audience_age_min || p.audience_age_max ? ` · ${p.audience_age_min ?? ''}–${p.audience_age_max ?? ''}` : ''}{p.audience_sector ? ` · ${p.audience_sector}` : ''}</dd>
                </dl>

                <h3>מסחרי</h3>
                <dl className="kv">
                  <dt>פתוחה ל</dt><dd>{[p.open_to_paid && 'תשלום', p.open_to_barter && 'בארטר', p.open_to_events && 'אירועים', p.open_to_affiliate && 'שותפים'].filter(Boolean).join(', ') || '—'}</dd>
                  <dt>סטטוס עסקי</dt><dd>{BILLING[p.billing_status]}</dd>
                  <dt>כתובת</dt><dd>{p.address_street
                    ? <>{[p.address_street, p.address_apt, p.address_city, p.address_zip].filter(Boolean).join(', ')}{p.address_confirmed_at && <span className="muted small"> · אושרה {fmtDate(p.address_confirmed_at)}</span>}</>
                    : '—'}</dd>
                  <dt>תנאים</dt><dd><bdi>{p.terms_version}</bdi> · {fmtDateTime(p.terms_accepted_at)}{p.terms_ip && <> · <bdi>{p.terms_ip}</bdi></>}</dd>
                </dl>

                {p.links.length > 0 && (
                  <>
                    <h3>תיק עבודות</h3>
                    <ul className="plain">{p.links.map((l) => <li key={l.id}><a href={l.url} target="_blank" rel="noreferrer">{l.label || l.url}</a></li>)}</ul>
                  </>
                )}
              </>
            )}

            {data.applications.length > 0 && (
              <>
                <h3>קמפיינים</h3>
                <ul className="plain">
                  {data.applications.map((a) => (
                    <li key={a.id}><Link to={`/admin/campaigns/${a.campaign_id}`}>{a.title}</Link> <AppStatusChip status={a.status} admin /></li>
                  ))}
                </ul>
              </>
            )}

            <details className="muted-details">
              <summary>פעילות אחרונה</summary>
              <ul className="plain small">
                {data.events.map((e, i) => <li key={i}>{fmtDateTime(e.created_at)} · {EVENT_LABELS[e.type] || e.type}</li>)}
              </ul>
            </details>
          </>
        )}
      </aside>
    </div>
  );
}
