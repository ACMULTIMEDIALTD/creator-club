import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Spinner } from '../../auth.jsx';
import { ErrorBox } from '../../components/ui.jsx';
import CampaignCard from '../../components/CampaignCard.jsx';
import { CampaignView } from '../Campaign.jsx';

const SAMPLE_ADDRESS = { address_street: 'הרצל 12', address_apt: 'דירה 4', address_city: 'תל אביב', address_zip: '' };

/**
 * Noa sees a campaign exactly as a creator does, at every stage, inside a phone-sized frame.
 * Built from the real campaign with made-up creator states; clicks inside do nothing.
 */
export default function AdminCampaignPreview() {
  const { slug } = useParams();
  const [base, setBase] = useState(null);
  const [error, setError] = useState(null);
  const [stage, setStage] = useState('page');
  const [note, setNote] = useState(false);

  useEffect(() => { api.get(`/campaigns/${slug}`).then(setBase).catch(setError); }, [slug]);

  const stages = useMemo(() => {
    if (!base) return [];
    const c = base.campaign;
    const list = [
      ['card', 'בלוח הקמפיינים'],
      ['page', 'לפני הגשה'],
      ['applied', 'אחרי הגשה'],
      ['selected', 'נבחרה'],
    ];
    if (c.type !== 'barter') list.push(['completed', 'הסרטון אושר']);
    return list;
  }, [base]);

  if (error) return <ErrorBox error={error} />;
  if (!base) return <Spinner />;

  const c = base.campaign;
  const now = new Date().toISOString();
  const ships = c.type === 'barter' || c.type === 'hybrid';
  const app = (status) => ({ id: 'preview', status, message: '', applied_at: now, decided_at: now });
  const data = {
    page: { campaign: c, my_application: null, selected: false, eligibility: { ok: true }, payment: null, shipping: null },
    applied: { campaign: c, my_application: app('applied'), selected: false, eligibility: { ok: false, reason: 'already_applied' }, payment: null, shipping: null },
    selected: { campaign: c, my_application: app('selected'), selected: true, eligibility: null, payment: null,
      shipping: ships ? { address: SAMPLE_ADDRESS, confirmed_at: null, shipping_address: null } : null },
    completed: { campaign: c, my_application: app('completed'), selected: true, eligibility: null,
      payment: { paid_at: null, invoice: null, saved_bank: null },
      shipping: ships ? { address: SAMPLE_ADDRESS, confirmed_at: now, shipping_address: 'הרצל 12, דירה 4, תל אביב' } : null },
  }[stage];

  // Nothing inside the preview may act: block clicks and form submits, say why
  const block = (e) => {
    if (e.target.closest('button, a, input[type=checkbox], input[type=radio], select, input[type=file]')) {
      e.preventDefault();
      e.stopPropagation();
      setNote(true);
      setTimeout(() => setNote(false), 1800);
    }
  };

  return (
    <div>
      <Link to="/admin/campaigns" className="back">→ קמפיינים</Link>
      <div className="page-head">
        <h1 className="page-title">תצוגה מקדימה: כך יוצרת רואה את הקמפיין</h1>
      </div>
      <p className="muted">יוצרת דמיונית שמתאימה לקמפיין. הבריף ותנאי התשלום מוצגים ליוצרת רק אחרי שנבחרה.</p>
      {c.status === 'draft' && <div className="alert">הקמפיין עדיין טיוטה: יוצרות לא רואות אותו עד שפותחים אותו להגשות.</div>}
      <div className="tabs">
        {stages.map(([k, label]) => <button key={k} className={stage === k ? 'on' : ''} onClick={() => setStage(k)}>{label}</button>)}
      </div>
      <div className="preview-phone" onClickCapture={block} onSubmitCapture={(e) => { e.preventDefault(); setNote(true); }}>
        <div className="preview-screen">
          {stage === 'card' ? (
            <div className="preview-pad">
              <h2 className="section-title">קמפיינים פתוחים</h2>
              <CampaignCard c={{ ...c, my_application: null, eligibility: { ok: true } }} />
            </div>
          ) : (
            <CampaignView key={stage} data={data} slug={slug} isAdmin={false} busy={false} withdraw={() => {}} load={() => {}} preview />
          )}
        </div>
        {note && <div className="preview-note" role="status">זו תצוגה מקדימה, שום דבר לא נשלח</div>}
      </div>
    </div>
  );
}
