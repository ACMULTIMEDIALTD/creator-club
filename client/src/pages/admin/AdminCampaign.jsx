import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, assetUrl } from '../../api.js';
import { Spinner } from '../../auth.jsx';
import { CAMPAIGN_STATUS, APP_STATUS_ADMIN, TIERS, fmtK, fmtDate, fmtDateTime, fmtNum } from '../../labels.js';
import { ErrorBox, Empty, TypeBadge, CampaignStatusChip, AppStatusChip, ConfirmButton, DownloadLink, igUrl, ttUrl } from '../../components/ui.jsx';

const NEXT_STATUS = {
  draft: [['open', 'פתיחה להגשות'], ['cancelled', 'ביטול']],
  open: [['closed', 'סגירת הגשות'], ['cancelled', 'ביטול']],
  closed: [['in_progress', 'מעבר לביצוע'], ['open', 'פתיחה מחדש']],
  in_progress: [['done', 'סימון כהסתיים']],
  done: [],
  cancelled: [['draft', 'החזרה לטיוטה']],
};
const CLOSING = ['closed', 'cancelled', 'in_progress', 'done'];

export default function AdminCampaign() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [checked, setChecked] = useState(new Set());
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [waText, setWaText] = useState(null);

  const load = () => api.get(`/admin/campaigns/${id}/applications`).then(setData).catch(setError);
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const rows = useMemo(() => (data?.applications || []).filter((a) => !filter || a.status === filter), [data, filter]);
  const counts = useMemo(() => {
    const c = {};
    for (const a of data?.applications || []) c[a.status] = (c[a.status] || 0) + 1;
    return c;
  }, [data]);

  const run = async (fn, msg) => {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); if (msg) flash(msg); } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const bulk = (status) => run(async () => {
    await api.post('/admin/applications/bulk', { ids: [...checked], status });
    setChecked(new Set());
  }, status === 'selected' ? 'סומנו כנבחרות, נשלח להן מייל ✓'
    : status === 'completed' && data.campaign.type !== 'barter' ? 'הסרטון אושר, נשלח מייל להעלאת חשבונית ✓' : 'עודכן ✓');

  const setStatus = (status) => {
    run(() => api.patch(`/admin/campaigns/${id}`, { status }), `הסטטוס עודכן: ${CAMPAIGN_STATUS[status]}`);
  };

  const remove = () => {
    run(async () => { await api.del(`/admin/campaigns/${id}`); nav('/admin/campaigns'); });
  };

  const copyWhatsapp = async () => {
    try {
      const { text } = await api.get(`/admin/campaigns/${id}/whatsapp-text`);
      try {
        await navigator.clipboard.writeText(text);
        flash('ההודעה הועתקה, אפשר להדביק בקבוצה 📋');
      } catch {
        setWaText(text); // clipboard blocked → show it for manual copy
      }
    } catch (e) { setError(e); }
  };

  const toggle = (aid) => setChecked((s) => { const n = new Set(s); n.has(aid) ? n.delete(aid) : n.add(aid); return n; });
  const allChecked = rows.length > 0 && rows.every((r) => checked.has(r.id));
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(rows.map((r) => r.id)));

  if (!data) return error ? <ErrorBox error={error} /> : <Spinner />;
  const c = data.campaign;
  const selectedCount = (counts.selected || 0) + (counts.completed || 0);

  return (
    <div>
      <Link to="/admin/campaigns" className="back">→ קמפיינים</Link>
      <div className="page-head">
        {c.image_url && <img className="admin-thumb" src={assetUrl(c.image_url)} alt="" />}
        <div className="grow">
          <h1 className="page-title">{c.title}</h1>
          <div className="row-inline">
            <TypeBadge type={c.type} /><CampaignStatusChip status={c.status} />
            <span className="muted small">{c.brand_name || c.brand_display_name} · הגשה עד {fmtDateTime(c.deadline_apply)} · מינ׳ {fmtNum(c.min_followers)}</span>
          </div>
        </div>
        <div className={`slots-meter${selectedCount > c.slots ? ' over' : ''}`} title="נבחרו / מקומות">
          <b>{selectedCount}/{c.slots}</b><span>נבחרו</span>
        </div>
      </div>

      <div className="actions-bar">
        {c.status !== 'draft' && <button className="btn whatsapp sm" onClick={copyWhatsapp}>העתקת הודעת ווטסאפ</button>}
        <DownloadLink className="btn ghost sm" href={`/api/v1/admin/campaigns/${id}/export.csv`}>ייצוא נבחרות (CSV)</DownloadLink>
        <Link className="btn ghost sm" to={`/admin/campaigns/${id}/edit`}>עריכה</Link>
        <Link className="btn ghost sm" to={`/admin/preview/${c.slug}`}>👁 תצוגה מקדימה</Link>
        {NEXT_STATUS[c.status].map(([s, label]) => (
          <ConfirmButton key={s} className={`btn sm ${s === 'cancelled' ? 'danger' : s === 'open' ? 'primary' : 'outline'}`} disabled={busy}
            ask={CLOSING.includes(s) && counts.applied ? `${counts.applied} מועמדויות ממתינות יסומנו כ״לא הפעם״. להמשיך?` : null}
            onConfirm={() => setStatus(s)}>{label}</ConfirmButton>
        ))}
        {c.status === 'draft' && <ConfirmButton className="btn sm danger" disabled={busy} ask="למחוק את הטיוטה?" onConfirm={remove}>מחיקה</ConfirmButton>}
      </div>

      {waText && (
        <div className="card">
          <p className="muted">ההעתקה האוטומטית נחסמה. אפשר לסמן ולהעתיק:</p>
          <textarea readOnly rows={6} value={waText} onFocus={(e) => e.target.select()} />
          <button className="btn ghost sm" onClick={() => setWaText(null)}>סגירה</button>
        </div>
      )}
      <ErrorBox error={error} />

      <div className="tabs">
        <button className={!filter ? 'on' : ''} onClick={() => setFilter('')}>הכל ({data.applications.length})</button>
        {Object.entries(APP_STATUS_ADMIN).map(([k, v]) => counts[k] ? (
          <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{v} ({counts[k]})</button>
        ) : null)}
      </div>

      {!rows.length ? <Empty>{data.applications.length ? 'אין מועמדויות בסינון הזה.' : 'עוד אין מועמדויות.'}</Empty> : (
        <>
          <div className={`bulk-bar${checked.size ? ' show' : ''}`}>
            <span>{checked.size} מסומנות</span>
            <button className="btn primary sm" disabled={busy || !checked.size} onClick={() => bulk('selected')}>סמני כנבחרות</button>
            <button className="btn ghost sm" disabled={busy || !checked.size} onClick={() => bulk('rejected')}>לא הפעם</button>
            <button className="btn ghost sm" disabled={busy || !checked.size} onClick={() => bulk('completed')}>הסרטון אושר</button>
            <button className="btn ghost sm" disabled={busy || !checked.size} onClick={() => bulk('applied')}>החזרה להמתנה</button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th><input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="סימון הכל" /></th>
                  <th>שם</th><th>רשתות</th><th>עוקבים</th><th className="hide-sm">תחומים</th><th>דרגה</th><th className="hide-sm">הודעה</th><th>סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className={checked.has(a.id) ? 'selected' : ''} onClick={() => a.status !== 'withdrawn' && toggle(a.id)}>
                    <td><input type="checkbox" checked={checked.has(a.id)} disabled={a.status === 'withdrawn'} onChange={() => toggle(a.id)} onClick={(e) => e.stopPropagation()} aria-label="סימון" /></td>
                    <td>
                      <Link to={`/admin/creators?open=${a.creator_id}`} onClick={(e) => e.stopPropagation()}><b>{a.full_name}</b></Link>
                      <span className="muted small block">{[a.city, fmtDate(a.applied_at)].filter(Boolean).join(' · ')}</span>
                    </td>
                    <td className="small" onClick={(e) => e.stopPropagation()}>
                      {a.instagram_handle && <a href={igUrl(a.instagram_handle)} target="_blank" rel="noreferrer" dir="ltr">@{a.instagram_handle}</a>}
                      {a.tiktok_handle && <><br /><a href={ttUrl(a.tiktok_handle)} target="_blank" rel="noreferrer" dir="ltr">tt/@{a.tiktok_handle}</a></>}
                    </td>
                    <td className="num">{fmtK(a.max_followers)}</td>
                    <td className="hide-sm small">{a.niches.join(', ')}</td>
                    <td><span className={`tier tier-${a.tier}`}>{TIERS[a.tier]}</span>{a.internal_rating ? <span className="small"> {'★'.repeat(a.internal_rating)}</span> : null}</td>
                    <td className="hide-sm small msg">{a.message}</td>
                    <td>
                      <AppStatusChip status={a.status} admin />
                      {['selected', 'completed'].includes(a.status) && c.type !== 'paid' && (
                        <span className="block small" title={a.shipping_address || ''}>
                          {a.address_confirmed_at ? '📦 כתובת אושרה' : '📦 ממתין לאישור כתובת'}
                        </span>
                      )}
                      {a.status === 'completed' && c.type !== 'barter' && (
                        <Link to="/admin/payments" className="block small" onClick={(e) => e.stopPropagation()}>
                          {a.paid_at ? 'שולם ✓' : a.invoice ? `חשבונית ₪${fmtNum(a.invoice.amount_ils)}` : 'ממתין לחשבונית'}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
