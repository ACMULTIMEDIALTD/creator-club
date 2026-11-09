import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, Spinner } from '../auth.jsx';
import { ErrorBox, Empty, AppStatusChip, TypeBadge } from '../components/ui.jsx';
import CampaignCard from '../components/CampaignCard.jsx';
import InstallHint from '../components/InstallHint.jsx';

function StatusBanner({ me }) {
  const { status } = me.user;
  if (status === 'pending') {
    return (
      <div className="banner pending">
        <h2>ההרשמה התקבלה 💛</h2>
        <p>נועה עוברת על כל פרופיל אישית ומאשרת תוך 48 שעות. ברגע שתאושרי, נשלח לך מייל ויופיעו כאן הקמפיינים הפתוחים.</p>
        <Link to="/me" className="btn ghost sm">לעריכת הפרופיל</Link>
      </div>
    );
  }
  return (
    <div className="banner active">
      <div>
        <h2>היי {me.profile?.full_name?.split(' ')[0]} 👋</h2>
        <p>את חברה פעילה בקהילה.</p>
      </div>
      {me.whatsapp_group_url && (
        <a href={me.whatsapp_group_url} target="_blank" rel="noreferrer" className="btn whatsapp">הצטרפות לקבוצת הווטסאפ</a>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { me } = useAuth();
  const [board, setBoard] = useState(null);
  const [apps, setApps] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/campaigns'), api.get('/me/applications')])
      .then(([b, a]) => { setBoard(b); setApps(a.applications); })
      .catch(setError);
  }, []);

  const active = (apps || []).filter((a) => ['applied', 'selected'].includes(a.status));

  return (
    <div>
      <InstallHint />
      <StatusBanner me={me} />
      {me.needs_address && (
        <div className="alert">
          📦 <b>חסרה כתובת למשלוח מוצרים.</b> בלי כתובת אי אפשר להגיש מועמדות לקמפיינים של בארטר ומשולבים.{' '}
          <Link to="/me">להוספת כתובת</Link>
        </div>
      )}
      <ErrorBox error={error} />
      {!board ? <Spinner /> : (
        <>
          {active.length > 0 && (
            <section>
              <h2 className="section-title">ההגשות הפעילות שלי</h2>
              <ul className="list">
                {active.map((a) => (
                  <li key={a.id}>
                    <Link to={`/c/${a.slug}`} className="list-row">
                      <span className="grow"><b>{a.title}</b> <span className="muted">· {a.brand_display_name}</span></span>
                      <TypeBadge type={a.type} />
                      <AppStatusChip status={a.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!board.locked && (
            <section>
              <h2 className="section-title">קמפיינים פתוחים</h2>
              {board.campaigns.length ? (
                <div className="grid">{board.campaigns.map((c) => <CampaignCard key={c.slug} c={c} />)}</div>
              ) : (
                <Empty>אין כרגע קמפיינים פתוחים. קמפיינים חדשים מתפרסמים בקבוצת הווטסאפ, אז כדאי לשים עין 👀</Empty>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
