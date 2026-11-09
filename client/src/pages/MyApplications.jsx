import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Spinner } from '../auth.jsx';
import { fmtDate, REJECTED_SOFT } from '../labels.js';
import { ErrorBox, Empty, AppStatusChip, TypeBadge } from '../components/ui.jsx';

export default function MyApplications() {
  const [apps, setApps] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.get('/me/applications').then((r) => setApps(r.applications)).catch(setError); }, []);

  if (error) return <ErrorBox error={error} />;
  if (!apps) return <Spinner />;
  return (
    <div className="narrow">
      <h1 className="page-title">ההגשות שלי</h1>
      {!apps.length ? <Empty>עוד לא הגשת מועמדות לקמפיינים. <Link to="/dashboard">לקמפיינים הפתוחים</Link></Empty> : (
        <ul className="list">
          {apps.map((a) => (
            <li key={a.id}>
              <Link to={`/c/${a.slug}`} className="list-row stack-sm">
                <span className="grow">
                  <b>{a.title}</b>
                  <span className="muted"> · {a.brand_display_name} · {fmtDate(a.applied_at)}</span>
                  {a.status === 'rejected' && <span className="soft">{REJECTED_SOFT}</span>}
                </span>
                <TypeBadge type={a.type} />
                <AppStatusChip status={a.status} />
                {a.status === 'completed' && a.type !== 'barter' && (
                  a.paid_at ? <span className="pay-chip done">שולם ✓</span>
                    : a.has_invoice ? <span className="pay-chip">חשבונית התקבלה</span>
                      : <span className="pay-chip todo">להעלות חשבונית</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
