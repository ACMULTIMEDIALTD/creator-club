import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Spinner } from '../auth.jsx';
import { ErrorBox, ConfirmButton } from '../components/ui.jsx';
import ProfileWizard from '../components/ProfileWizard.jsx';

export default function EditProfile() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => { api.get('/me/profile').then((r) => setProfile(r.profile)).catch(setError); }, []);

  const forgetBank = async () => {
    try {
      await api.del('/me/bank');
      setProfile((p) => ({ ...p, bank_account_holder: null, bank_name: null, bank_branch: null, bank_account_number: null }));
    } catch (e) { setError(e); }
  };

  if (error) return <ErrorBox error={error} />;
  if (!profile) return <Spinner />;

  return (
    <div className="narrow">
      <div className="page-head">
        <h1 className="page-title">הפרופיל שלי</h1>
        <Link to="/password" className="btn ghost sm">החלפת סיסמה</Link>
      </div>
      {saved && <div className="alert success" role="status">הפרופיל נשמר ✓</div>}
      {profile.bank_account_number && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>פרטי בנק שמורים</h3>
          <p className="small">{profile.bank_account_holder} · {profile.bank_name} · סניף {profile.bank_branch} · חשבון <bdi dir="ltr">•••{profile.bank_account_number.slice(-3)}</bdi></p>
          <p className="small muted">ממלאים אוטומטית את טופס החשבונית. אפשר לשנות אותם בהעלאת החשבונית הבאה.</p>
          <ConfirmButton ask="למחוק את פרטי הבנק מהפרופיל?" onConfirm={forgetBank}>מחיקת הפרטים</ConfirmButton>
        </div>
      )}
      <ProfileWizard
        key={key}
        initial={profile}
        submitLabel="שמירה"
        onSaved={(p) => { setProfile(p); setSaved(true); setKey((k) => k + 1); window.scrollTo(0, 0); }}
      />
      <p className="center-text small"><Link to="/me/delete" className="muted">מחיקת החשבון</Link></p>
    </div>
  );
}
