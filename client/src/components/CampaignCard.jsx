import { Link } from 'react-router-dom';
import { PLATFORMS, fmtNum, fmtDate, daysLeft } from '../labels.js';
import { TypeBadge, AppStatusChip } from './ui.jsx';
import { assetUrl } from '../api.js';

export function DeadlineText({ date }) {
  const d = daysLeft(date);
  if (d <= 0) return <span className="urgent">ההגשה נסגרה</span>;
  if (d === 1) return <span className="urgent">נסגר היום/מחר</span>;
  if (d <= 3) return <span className="urgent">עוד {d} ימים</span>;
  return <span>הגשה עד {fmtDate(date)}</span>;
}

export default function CampaignCard({ c }) {
  const elig = c.eligibility;
  return (
    <Link to={`/c/${c.slug}`} className={`card campaign-card${c.image_url ? ' has-img' : ''}`}>
      {c.image_url && <img className="cc-img" src={assetUrl(c.image_url)} alt="" loading="lazy" />}
      <div className="cc-top">
        <TypeBadge type={c.type} />
        {c.my_application ? <AppStatusChip status={c.my_application.status} /> : elig && !elig.ok ? <span className="chip muted">לא מתאים</span> : null}
      </div>
      <h3>{c.title}</h3>
      <div className="cc-brand">{c.brand_display_name}</div>
      <p className="cc-desc">{c.short_description}</p>
      <div className="cc-meta">
        <span>👥 {c.min_followers ? `${fmtNum(c.min_followers)}+ עוקבים` : 'ללא מינימום'}</span>
        <span>📱 {c.platforms.map((p) => PLATFORMS[p]).join(' · ')}</span>
        <span>🎟 {c.slots} מקומות</span>
        <span>⏳ <DeadlineText date={c.deadline_apply} /></span>
      </div>
      {elig && !elig.ok && !c.my_application && <div className="cc-reason">{elig.message}</div>}
    </Link>
  );
}
