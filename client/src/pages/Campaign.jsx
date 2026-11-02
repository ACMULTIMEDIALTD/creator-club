import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, assetUrl } from '../api.js';
import { useAuth, Spinner } from '../auth.jsx';
import { PLATFORMS, REJECTED_SOFT, fmtNum, fmtDate, fmtDateTime } from '../labels.js';
import { ErrorBox, TypeBadge, AppStatusChip, CampaignStatusChip, ConfirmButton } from '../components/ui.jsx';
import { DeadlineText } from '../components/CampaignCard.jsx';
import InvoiceBox from '../components/InvoiceBox.jsx';
import ShippingBox from '../components/ShippingBox.jsx';

function ApplyBox({ slug, onApplied }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/campaigns/${slug}/apply`, { message });
      await onApplied();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return <button className="btn primary block lg" onClick={() => setOpen(true)}>אני רוצה! הגשת מועמדות</button>;
  return (
    <div className="apply-box">
      <label className="field">
        <span className="field-label">למה את מתאימה? (לא חובה)</span>
        <textarea rows={3} maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="משפט או שניים לנועה" />
        <span className="hint">{message.length}/300</span>
      </label>
      <ErrorBox error={error} />
      <button className="btn primary block lg" disabled={busy} onClick={apply}>{busy ? 'שולחת…' : 'שליחת מועמדות'}</button>
    </div>
  );
}

export default function Campaign() {
  const { slug } = useParams();
  const { me } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/campaigns/${slug}`).then(setData).catch(setError);
  useEffect(() => { load(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const withdraw = async () => {
    setBusy(true);
    try { await api.del(`/campaigns/${slug}/apply`); await load(); } catch (e) { setError(e); } finally { setBusy(false); }
  };

  if (error?.status === 404) {
    return (
      <div className="narrow card center">
        <h1>הקמפיין לא נמצא</h1>
        <p>ייתכן שהוא כבר נסגר.</p>
        <Link to="/dashboard" className="btn primary">לקמפיינים הפתוחים</Link>
      </div>
    );
  }
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Spinner />;

  return <CampaignView data={data} slug={slug} isAdmin={me.user.role === 'admin'} busy={busy} withdraw={withdraw} load={load} />;
}

/**
 * The campaign page itself. Also used by Noa's preview (preview: true) with made-up states,
 * where it renders exactly what a creator sees and nothing in it is sent anywhere.
 */
export function CampaignView({ data, slug, isAdmin, busy, withdraw, load, preview }) {
  const { campaign: c, my_application: app, eligibility: elig, selected, payment, shipping } = data;

  return (
    <div className="narrow campaign-page">
      {!preview && <Link to={isAdmin ? '/admin/campaigns' : '/dashboard'} className="back">→ חזרה</Link>}
      <div className={`card${c.image_url ? ' has-img' : ''}`}>
        {c.image_url && <img className="campaign-hero" src={assetUrl(c.image_url)} alt="" />}
        <div className="cc-top">
          <TypeBadge type={c.type} />
          {c.status !== 'open' && <CampaignStatusChip status={c.status} />}
        </div>
        <h1>{c.title}</h1>
        <div className="cc-brand lg">{c.brand_display_name}</div>
        <p className="desc">{c.short_description}</p>

        <dl className="facts">
          <div><dt>מינימום עוקבים</dt><dd>{c.min_followers ? fmtNum(c.min_followers) : 'ללא'}</dd></div>
          <div><dt>פלטפורמות</dt><dd>{c.platforms.map((p) => PLATFORMS[p]).join(', ')}</dd></div>
          <div><dt>מקומות</dt><dd>{c.slots}</dd></div>
          <div><dt>הגשה עד</dt><dd>{fmtDateTime(c.deadline_apply)}</dd></div>
          {c.deadline_publish && <div><dt>פרסום עד</dt><dd>{fmtDate(c.deadline_publish)}</dd></div>}
          {c.product_value_ils ? <div><dt>שווי מוצר</dt><dd>₪{fmtNum(c.product_value_ils)}</dd></div> : null}
          {c.niche_names.length > 0 && <div><dt>תחומים</dt><dd>{c.niche_names.join(', ')}</dd></div>}
          {c.region_names.length > 0 && <div><dt>אזור</dt><dd>{c.region_names.join(', ')}</dd></div>}
        </dl>
      </div>

      {shipping && <ShippingBox applicationId={app.id} shipping={shipping} onChange={load} />}
      {payment && <InvoiceBox applicationId={app.id} payment={payment} onChange={load} />}

      {(selected || isAdmin) && (
        <div className="card selected-card">
          {selected && <h2 className="celebrate">{app?.status === 'completed' ? 'הבריף ותנאי התשלום' : 'נבחרת 🎉'}</h2>}
          {isAdmin && <p className="muted">תצוגת מנהלת: הבריף ותנאי התשלום מוצגים רק ליוצרות שנבחרו.</p>}
          {c.payment_note && (<><h3>תנאי תשלום</h3><p className="pre">{c.payment_note}</p></>)}
          <h3>הבריף המלא</h3>
          <div className="pre brief">{c.full_brief || 'הבריף יעלה בקרוב.'}</div>
        </div>
      )}

      {!isAdmin && !selected && (
        <div className="card">
          {app ? (
            <>
              <div className="app-state">
                <AppStatusChip status={app.status} />
                <span className="muted">הוגש ב-{fmtDate(app.applied_at)}</span>
              </div>
              {app.status === 'applied' && (
                <>
                  <p>קיבלנו! נועה עוברת על המועמדויות ותעדכן את מי שנבחרו.</p>
                  <ConfirmButton ask="לבטל את המועמדות?" disabled={busy} onConfirm={withdraw}>ביטול מועמדות</ConfirmButton>
                </>
              )}
              {app.status === 'rejected' && <p>{REJECTED_SOFT}</p>}
              {app.status === 'withdrawn' && elig?.ok && <ApplyBox slug={slug} onApplied={load} />}
            </>
          ) : elig?.ok ? (
            <>
              <p className="muted"><DeadlineText date={c.deadline_apply} /></p>
              <ApplyBox slug={slug} onApplied={load} />
            </>
          ) : (
            <div className="blocked">
              <span className="blocked-icon" aria-hidden="true">✋</span>
              <div>
                <b>{elig?.message}</b>
                {['not_open_to_paid', 'not_open_to_barter', 'not_open_to_type', 'min_followers', 'missing_address'].includes(elig?.reason) && (
                  <p className="muted">אם משהו השתנה, אפשר לעדכן את <Link to="/me">הפרופיל</Link>.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
