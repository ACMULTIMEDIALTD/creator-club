import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Spinner } from '../../auth.jsx';
import { fmtK, fmtDate } from '../../labels.js';
import { ErrorBox, Empty, TypeBadge, CampaignStatusChip } from '../../components/ui.jsx';
import { DeadlineText } from '../../components/CampaignCard.jsx';

/** The install-guide link, ready to paste and pin in the WhatsApp group. */
function InstallLinkBox() {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/install`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(`📲 איך מוסיפים את הקהילה למסך הבית (פעם אחת, דקה):\n${url}`); setCopied(true); } catch { /* select manually */ }
  };
  return (
    <div className="share-box">
      <span className="grow small">קישור למדריך ״הוספה למסך הבית״, לנעוץ בקבוצה:</span>
      <code>{url}</code>
      <button className="btn ghost sm" onClick={copy}>{copied ? 'הועתק ✓' : 'העתקת הודעה'}</button>
    </div>
  );
}

export default function AdminHome() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = () => api.get('/admin/overview').then(setData).catch(setError);
  useEffect(() => { load(); }, []);

  const approve = async (id) => {
    setBusyId(id);
    try { await api.patch(`/admin/creators/${id}`, { status: 'active' }); await load(); } catch (e) { setError(e); } finally { setBusyId(null); }
  };

  if (!data) return error ? <ErrorBox error={error} /> : <Spinner />;
  const { stats } = data;
  const ready = data.pending.filter((p) => p.has_profile);
  const incomplete = data.pending.filter((p) => !p.has_profile);

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">היום</h1>
        <div className="head-actions">
          <Link to="/admin/team" className="btn ghost sm">צוות ניהול</Link>
          <Link to="/password" className="btn ghost sm">החלפת סיסמה</Link>
          <Link to="/admin/campaigns/new" className="btn primary">+ קמפיין חדש</Link>
        </div>
      </div>
      <ErrorBox error={error} />
      {data.email_typos?.length > 0 && (
        <div className="alert">
          <b>⚠️ מיילים עם טעות הקלדה</b> (היוצרות האלה לא מקבלות קודי כניסה ומיילים). אפשר לתקן בכרטיס היוצרת, בעיפרון שליד המייל:
          <ul>
            {data.email_typos.map((t) => (
              <li key={t.id}>
                <Link to={`/admin/creators?open=${t.id}`}>{t.full_name || t.email}</Link>: <bdi dir="ltr">{t.email}</bdi>, כנראה התכוונה ל-<bdi dir="ltr">{t.suggestion}</bdi>
              </li>
            ))}
          </ul>
        </div>
      )}
      <InstallLinkBox />
      <div className="stats">
        <div className="stat"><b>{stats.active}</b><span>חברות פעילות</span></div>
        <div className="stat"><b>{stats.pending_complete}</b><span>ממתינות לאישור</span></div>
        <div className="stat"><b>{stats.pending_incomplete}</b><span>לא סיימו הרשמה</span></div>
      </div>

      <section>
        <h2 className="section-title">קמפיינים פעילים</h2>
        {!data.campaigns.length ? <Empty>אין קמפיינים פעילים.</Empty> : (
          <ul className="list">
            {data.campaigns.map((c) => (
              <li key={c.id}>
                <Link to={`/admin/campaigns/${c.id}`} className="list-row">
                  <span className="grow"><b>{c.title}</b> <span className="muted">· {c.brand_display_name}</span>
                    <span className="muted small block">{c.status === 'open' ? <DeadlineText date={c.deadline_apply} /> : null}</span>
                  </span>
                  <TypeBadge type={c.type} />
                  <CampaignStatusChip status={c.status} />
                  <span className="counts" title="הגישו · נבחרו/מקומות">{c.applied_count} הגישו · <b>{c.selected_count}/{c.slots}</b></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="section-title">ממתינות לאישור ({ready.length})</h2>
        {!ready.length ? <Empty>אין יוצרות שממתינות לאישור 🎉</Empty> : (
          <ul className="list">
            {ready.map((p) => (
              <li key={p.id} className="list-row">
                <span className="grow">
                  <b>{p.full_name}</b>
                  <span className="muted small block">
                    {p.instagram_handle && <a href={`https://instagram.com/${p.instagram_handle}`} target="_blank" rel="noreferrer" dir="ltr">@{p.instagram_handle}</a>}
                    {p.instagram_handle && ` · ${fmtK(p.instagram_followers)}`}
                    {p.tiktok_handle && <> · TikTok {fmtK(p.tiktok_followers)}</>}
                    {' · '}נרשמה {fmtDate(p.created_at)}
                  </span>
                </span>
                <Link to={`/admin/creators?open=${p.id}`} className="btn ghost sm">פרופיל</Link>
                <button className="btn primary sm" disabled={busyId === p.id} onClick={() => approve(p.id)}>אישור</button>
              </li>
            ))}
          </ul>
        )}
        {incomplete.length > 0 && (
          <details className="muted-details">
            <summary>{incomplete.length} נרשמו ולא השלימו פרופיל</summary>
            <ul className="plain">
              {incomplete.map((p) => <li key={p.id}><span dir="ltr">{p.email}</span> · <span dir="ltr">{p.phone}</span> · {fmtDate(p.created_at)}</li>)}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
