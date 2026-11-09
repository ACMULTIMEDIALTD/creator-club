import { startTransition, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { setToken } from '../native/platform.js';
import { Field, ErrorBox } from '../components/ui.jsx';
import { fmtDate } from '../labels.js';
import TermsDialog from '../components/TermsDialog.jsx';

const WORD = 'מחיקה';

/** Delete the account from inside the app (required by the App Store), and on the site. */
export default function DeleteAccount() {
  const { me, setMe } = useAuth();
  const accepted = me?.profile;
  const nav = useNavigate();
  const [typed, setTyped] = useState('');
  const [ack, setAck] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const remove = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.del('/me/account', { confirm: typed.trim(), acknowledge_terms: ack });
      await setToken(null);
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const leave = () => startTransition(() => { setMe(null); nav('/', { replace: true }); });

  if (done) {
    return (
      <div className="narrow card center">
        <h1>החשבון נמחק</h1>
        <p>תודה שהיית חלק מהקהילה 💛 תמיד אפשר להירשם מחדש.</p>
        <button className="btn primary" onClick={leave}>לדף הבית</button>
      </div>
    );
  }

  return (
    <div className="narrow">
      <Link to="/me" className="back">→ חזרה לפרופיל</Link>
      <h1 className="page-title">מחיקת החשבון</h1>
      <div className="card">
        <p><b>המחיקה סופית ואי אפשר לבטל אותה.</b> יימחקו:</p>
        <ul>
          <li>הפרופיל, פרטי הקשר והכתובת</li>
          <li>ההגשות לקמפיינים וההיסטוריה שלך</li>
          <li>פרטי הבנק השמורים וההתראות לטלפון</li>
        </ul>
        <p className="small muted">
          חשבוניות וקבלות שהעלית נשמרות אצל נועה כמסמכי תשלום, כפי שהחוק מחייב.
          אם יש תשלום שעוד לא הועבר אלייך, הוא לא יבוטל, אבל כדאי לעדכן את נועה בווטסאפ.
        </p>
      </div>

      <div className="card terms-after">
        <h2>התנאים שאישרת</h2>
        {accepted?.terms_accepted_at ? (
          <p>
            בהצטרפות לקהילה אישרת את <b>תנאי ההצטרפות לקהילה</b> (גרסה <bdi dir="ltr">{accepted.terms_version}</bdi>)
            בתאריך {fmtDate(accepted.terms_accepted_at)}.{' '}
            <button type="button" className="linklike" onClick={() => setShowTerms(true)}>לקריאת התנאים המלאים</button>
          </p>
        ) : (
          <p>בהצטרפות לקהילה אישרת את <button type="button" className="linklike" onClick={() => setShowTerms(true)}>תנאי ההצטרפות לקהילה</button>.</p>
        )}
        <p>
          מחיקת החשבון מסיימת את החברות שלך בקהילה, אבל <b>אינה מבטלת התחייבויות שכבר נוצרו לפי התנאים</b>,
          ואינה מהווה דרך לעקוף אותם. בפרט:
        </p>
        <ul>
          <li><b>אי-עקיפה:</b> לא לפנות למותגים שהכרת דרך הקהילה ולא לעבוד איתם ישירות שלא דרך נועה, במשך 12 חודשים מסיום החברות (סעיפים 3 ו-6.1).</li>
          <li><b>סודיות:</b> תמחור, פרטי מותגים ובריפים שנחשפת אליהם נשארים חסויים גם אחרי המחיקה, במשך 12 חודשים (סעיפים 5 ו-6.1).</li>
          <li><b>שיתופי פעולה שאושרו:</b> שיתוף פעולה שכבר אישרת יושלם כפי שסוכם (סעיף 6.1).</li>
        </ul>
        <p className="small muted">
          לכן, גם אחרי המחיקה נשמר תיעוד של אישור התנאים: שמך, פרטי הקשר, גרסת התנאים, מועד האישור וכתובת ה-IP.
          שאר המידע נמחק.
        </p>
        {showTerms && <TermsDialog onClose={() => setShowTerms(false)} />}
      </div>

      <div className="card">
        <form className="form" onSubmit={remove}>
          <label className={`check-confirm${error?.fields?.acknowledge_terms ? ' has-error' : ''}`}>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>קראתי והבנתי שמחיקת החשבון אינה מבטלת את ההתחייבויות שלי לפי תנאי הקהילה</span>
          </label>
          <Field label={`לאישור, הקלידי "${WORD}"`} error={error?.fields?.confirm}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
          <ErrorBox error={error && !error.fields?.confirm ? error : null} />
          <button className="btn danger block" disabled={busy || !ack || typed.trim() !== WORD}>{busy ? 'מוחקת…' : 'מחיקת החשבון לצמיתות'}</button>
        </form>
      </div>
    </div>
  );
}
