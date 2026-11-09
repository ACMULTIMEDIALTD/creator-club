import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, assetUrl } from '../../api.js';
import { Spinner } from '../../auth.jsx';
import { BILLING, DOC_TYPES, fmtDate, fmtNum } from '../../labels.js';
import { ErrorBox, Empty, ConfirmButton } from '../../components/ui.jsx';

const TABS = [
  ['ready', 'לתשלום'],
  ['waiting', 'ממתינות לחשבונית'],
  ['paid', 'שולמו'],
  ['archive', 'ארכיון'],
];
const stateOf = (p) => (p.paid_at ? 'paid' : p.invoice ? 'ready' : 'waiting');
const waLink = (phone, text) => `https://wa.me/972${phone.replace(/^0/, '')}?text=${encodeURIComponent(text)}`;

export default function AdminPayments() {
  const [data, setData] = useState(null);
  const [archive, setArchive] = useState([]);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('ready');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(null);

  const load = () => api.get('/admin/payments').then((r) => { setData(r.payments); setArchive(r.archive || []); }).catch(setError);
  useEffect(() => { load(); }, []);

  const groups = useMemo(() => {
    const g = { ready: [], waiting: [], paid: [], archive };
    for (const p of data || []) g[stateOf(p)].push(p);
    return g;
  }, [data, archive]);

  const setPaid = async (id, paid) => {
    setBusy(true);
    setError(null);
    try { await api.post(`/admin/applications/${id}/paid`, { paid }); await load(); } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const copyBank = async (p) => {
    const i = p.invoice;
    const text = `${i.account_holder}\n${i.bank_name}\nסניף ${i.branch}\nחשבון ${i.account_number}\nסכום ₪${i.amount_ils}`;
    try { await navigator.clipboard.writeText(text); setCopied(p.id); setTimeout(() => setCopied(null), 2000); } catch { /* clipboard blocked: details are on screen */ }
  };

  if (!data) return error ? <ErrorBox error={error} /> : <Spinner />;
  const rows = groups[tab];
  const total = groups.ready.reduce((s, p) => s + p.invoice.amount_ils, 0);

  return (
    <div>
      <h1 className="page-title">תשלומים</h1>
      <p className="muted">סרטונים שאישרת בקמפיינים בתשלום. היוצרת מקבלת מייל עם האישור ומעלה חשבונית ופרטי בנק.</p>
      {groups.ready.length > 0 && <div className="stats"><div className="stat"><b>₪{fmtNum(total)}</b><span>ממתין לתשלום ({groups.ready.length})</span></div></div>}
      <ErrorBox error={error} />

      <div className="tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label} ({groups[k].length})</button>
        ))}
      </div>

      {tab === 'archive' ? (
        !archive.length ? <Empty>אין חשבוניות בארכיון.</Empty> : (
          <div className="pay-list">
            <p className="small muted">חשבוניות של יוצרות שמחקו את החשבון. נשמרות כמסמכי תשלום.</p>
            {archive.map((a) => (
              <div key={a.id} className="card pay-item">
                <div className="row-inline">
                  <b>{a.creator_name || a.creator_email}</b>
                  <span className="muted">· {a.campaign_title}</span>
                  <span className="small muted">· החשבון נמחק {fmtDate(a.account_deleted_at)}</span>
                </div>
                <div className="row-inline">
                  <span>{DOC_TYPES[a.doc_type]}</span>
                  <b>₪{fmtNum(a.amount_ils)}</b>
                  {a.paid_at ? <span className="pay-chip done">שולם {fmtDate(a.paid_at)}</span> : <span className="pay-chip todo">לא שולם</span>}
                </div>
                <div className="bank">
                  {a.account_holder} · {a.bank_name} · סניף <bdi dir="ltr">{a.branch}</bdi> · חשבון <bdi dir="ltr">{a.account_number}</bdi> · <bdi dir="ltr">{a.creator_email}</bdi>
                </div>
                <div className="row-inline"><a className="btn ghost sm" href={assetUrl(a.file_url)} target="_blank" rel="noreferrer">צפייה בחשבונית</a></div>
              </div>
            ))}
          </div>
        )
      ) : !rows.length ? (
        <Empty>{tab === 'ready' ? 'אין חשבוניות שממתינות לתשלום.' : tab === 'waiting' ? 'כל היוצרות העלו חשבונית.' : 'עוד לא סומנו תשלומים.'}</Empty>
      ) : (
        <div className="pay-list">
          {rows.map((p) => (
            <div key={p.id} className="card pay-item">
              <div className="row-inline">
                <b><Link to={`/admin/creators?open=${p.creator.id}`}>{p.creator.full_name}</Link></b>
                <span className="muted">· <Link to={`/admin/campaigns/${p.campaign.id}`}>{p.campaign.title}</Link></span>
                <span className="small muted">· סרטון אושר {fmtDate(p.approved_at)}</span>
              </div>
              {p.invoice ? (
                <>
                  <div className="row-inline">
                    <span>{DOC_TYPES[p.invoice.doc_type]}</span>
                    <b>₪{fmtNum(p.invoice.amount_ils)}</b>
                    <span className="small muted">· {BILLING[p.creator.billing_status]} · הועלתה {fmtDate(p.invoice.uploaded_at)}</span>
                  </div>
                  <div className="bank">
                    {p.invoice.account_holder} · {p.invoice.bank_name} · סניף <bdi dir="ltr">{p.invoice.branch}</bdi> · חשבון <bdi dir="ltr">{p.invoice.account_number}</bdi>
                  </div>
                  {p.campaign.payment_note && <p className="small muted">תנאי התשלום בקמפיין: {p.campaign.payment_note}</p>}
                  <div className="row-inline">
                    <a className="btn ghost sm" href={assetUrl(p.invoice.file_url)} target="_blank" rel="noreferrer">צפייה בחשבונית</a>
                    <button className="btn ghost sm" onClick={() => copyBank(p)}>{copied === p.id ? 'הועתק ✓' : 'העתקת פרטי הבנק'}</button>
                    {p.paid_at ? (
                      <>
                        <span className="pay-chip done">שולם {fmtDate(p.paid_at)}</span>
                        <ConfirmButton ask="לבטל את סימון התשלום?" disabled={busy} onConfirm={() => setPaid(p.id, false)}>ביטול סימון</ConfirmButton>
                      </>
                    ) : (
                      <ConfirmButton className="btn primary sm" ask={`לסמן ששולם? ${p.creator.full_name} תקבל מייל.`} disabled={busy} onConfirm={() => setPaid(p.id, true)}>סימון כשולם</ConfirmButton>
                    )}
                  </div>
                </>
              ) : (
                <div className="row-inline">
                  <span className="pay-chip todo">עוד לא הועלתה חשבונית</span>
                  {p.creator.phone && (
                    <a className="btn whatsapp sm" target="_blank" rel="noreferrer"
                      href={waLink(p.creator.phone, `היי ${p.creator.full_name}, הסרטון לקמפיין "${p.campaign.title}" אושר 🎉 כדי שנעביר תשלום, צריך להעלות חשבונית ופרטי בנק בעמוד הקמפיין: ${window.location.origin}/c/${p.campaign.slug}`)}>
                      תזכורת בווטסאפ
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
