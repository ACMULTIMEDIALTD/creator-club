import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Spinner } from '../../auth.jsx';
import { CAMPAIGN_STATUS, fmtDate } from '../../labels.js';
import { ErrorBox, Empty, TypeBadge, CampaignStatusChip } from '../../components/ui.jsx';

export default function AdminCampaigns() {
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setRows(null);
    api.get(`/admin/campaigns${status ? `?status=${status}` : ''}`).then((r) => setRows(r.campaigns)).catch(setError);
  }, [status]);

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">קמפיינים</h1>
        <Link to="/admin/campaigns/new" className="btn primary">+ קמפיין חדש</Link>
      </div>
      <div className="tabs">
        <button className={!status ? 'on' : ''} onClick={() => setStatus('')}>הכל</button>
        {Object.entries(CAMPAIGN_STATUS).map(([k, v]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{v}</button>)}
      </div>
      <ErrorBox error={error} />
      {!rows ? <Spinner /> : !rows.length ? <Empty>אין קמפיינים.</Empty> : (
        <ul className="list">
          {rows.map((c) => (
            <li key={c.id} className="with-action">
              <Link to={`/admin/campaigns/${c.id}`} className="list-row">
                <span className="grow">
                  <b>{c.title}</b> <span className="muted">· {c.brand_name || c.brand_display_name}</span>
                  <span className="muted small block">הגשה עד {fmtDate(c.deadline_apply)} · /c/{c.slug}</span>
                </span>
                <TypeBadge type={c.type} />
                <CampaignStatusChip status={c.status} />
                <span className="counts">{c.applied_count} ממתינות · <b>{c.selected_count}/{c.slots}</b></span>
              </Link>
              <Link to={`/admin/preview/${c.slug}`} className="btn ghost sm preview-btn" title="כך יוצרת רואה את הקמפיין">👁 תצוגה מקדימה</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
