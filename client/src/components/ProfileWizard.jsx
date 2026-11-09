import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { BILLING, GENDER, SECTORS } from '../labels.js';
import { Field, ErrorBox, Toggle } from './ui.jsx';
import TermsAcceptance from './TermsAcceptance.jsx';

export const STEPS = ['פרטים', 'רשתות', 'קהל ותחומים', 'שיתופי פעולה ותנאים'];

const STEP_OF = {
  full_name: 0, birth_year: 0, city: 0, region_id: 0,
  instagram_handle: 1, instagram_followers: 1, tiktok_handle: 1, tiktok_followers: 1, youtube_url: 1, other_platforms: 1, links: 1,
  audience_gender: 2, audience_age_min: 2, audience_age_max: 2, audience_sector: 2, niches: 2,
};
const stepOf = (key) => STEP_OF[key.split('.')[0]] ?? 3;

const EMPTY = {
  full_name: '', birth_year: '', city: '', region_id: '',
  instagram_handle: '', instagram_followers: '', tiktok_handle: '', tiktok_followers: '', youtube_url: '', other_platforms: '',
  audience_gender: '', audience_age_min: '', audience_age_max: '', audience_sector: '',
  open_to_paid: true, open_to_barter: true, open_to_events: false, open_to_affiliate: false,
  billing_status: 'none',
  address_street: '', address_apt: '', address_city: '', address_zip: '',
  niches: [], links: [],
};
const ADDRESS_KEYS = ['address_street', 'address_apt', 'address_city', 'address_zip'];

function fromProfile(p) {
  if (!p) return EMPTY;
  const f = { ...EMPTY };
  for (const k of Object.keys(EMPTY)) if (p[k] != null) f[k] = p[k];
  f.niches = p.niche_ids || [];
  f.links = (p.links || []).map(({ url, label }) => ({ url, label: label || '' }));
  return f;
}

/** Quick per-step checks so creators don't hit the server for obvious misses on a phone. */
function localErrors(step, f) {
  const e = {};
  if (step === 0 && f.full_name.trim().length < 2) e.full_name = 'שדה חובה';
  if (step === 1) {
    if (!f.instagram_handle.trim() && !f.tiktok_handle.trim()) e.instagram_handle = 'יש להזין לפחות חשבון אינסטגרם או טיקטוק';
    if (f.instagram_handle.trim() && f.instagram_followers === '') e.instagram_followers = 'כמה עוקבים יש באינסטגרם?';
    if (f.tiktok_handle.trim() && f.tiktok_followers === '') e.tiktok_followers = 'כמה עוקבים יש בטיקטוק?';
  }
  if (step === 2 && !f.niches.length) e.niches = 'יש לבחור לפחות תחום אחד';
  return e;
}

export default function ProfileWizard({ initial, requireTerms, terms, submitLabel, onSaved }) {
  const [meta, setMeta] = useState(null);
  const [f, setF] = useState(() => fromProfile(initial));
  const [step, setStep] = useState(0);
  const [termsOk, setTermsOk] = useState(false);
  // Already confirmed stays ticked until she changes the address
  const [addressOk, setAddressOk] = useState(!!initial?.address_confirmed_at);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/public/meta').then(setMeta).catch(setError); }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [step]);

  const set = (k) => (v) => {
    if (ADDRESS_KEYS.includes(k)) setAddressOk(false);
    setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));
  };
  const toggleNiche = (id) => setF((s) => ({
    ...s, niches: s.niches.includes(id) ? s.niches.filter((x) => x !== id) : s.niches.length >= 5 ? s.niches : [...s.niches, id],
  }));
  const setLink = (i, k, v) => setF((s) => ({ ...s, links: s.links.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));

  const next = () => {
    const e = localErrors(step, f);
    setErrors(e);
    if (!Object.keys(e).length) setStep(step + 1);
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (step < STEPS.length - 1) return next();
    if (requireTerms && !termsOk) { setErrors({ terms_accept: 'יש לקרוא את התנאים עד הסוף ולאשר אותם' }); return; }
    setBusy(true);
    setError(null);
    try {
      const body = {
        ...f,
        region_id: f.region_id ? Number(f.region_id) : null,
        links: f.links.filter((l) => l.url.trim()),
        address_confirmed: addressOk,
        ...(requireTerms ? { terms_accept: { version: terms.version, read_to_end: true } } : {}),
      };
      const res = await api.put('/me/profile', body);
      await onSaved(res.profile);
    } catch (err) {
      setError(err);
      setErrors(err.fields || {});
      const keys = Object.keys(err.fields || {});
      if (keys.length) setStep(Math.min(...keys.map(stepOf)));
    } finally {
      setBusy(false);
    }
  };

  if (!meta) return error ? <ErrorBox error={error} /> : null;
  const E = errors;

  return (
    <form className="wizard" onSubmit={submit} noValidate>
      <ol className="steps" aria-label="שלבים">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'current' : i < step ? 'done' : ''}>
            <button type="button" onClick={() => i < step && setStep(i)} disabled={i > step}>
              <span className="num">{i + 1}</span><span className="lbl">{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="card form">
        {step === 0 && (
          <>
            <h2>קצת עלייך</h2>
            <Field label="שם מלא" required error={E.full_name}><input value={f.full_name} onChange={set('full_name')} autoComplete="name" /></Field>
            <div className="row2">
              <Field label="שנת לידה" error={E.birth_year}><input inputMode="numeric" dir="ltr" value={f.birth_year} onChange={set('birth_year')} placeholder="1995" /></Field>
              <Field label="עיר" error={E.city}><input value={f.city} onChange={set('city')} autoComplete="address-level2" /></Field>
            </div>
            <Field label="אזור" error={E.region_id}>
              <select value={f.region_id} onChange={set('region_id')}>
                <option value="">בחרי אזור</option>
                {meta.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <h2>הרשתות שלך</h2>
            <p className="muted">לפחות אחת מהשתיים: אינסטגרם או טיקטוק.</p>
            <div className="row2">
              <Field label="אינסטגרם" error={E.instagram_handle} hint="שם משתמש, בלי @">
                <input dir="ltr" value={f.instagram_handle} onChange={set('instagram_handle')} placeholder="username" autoCapitalize="none" />
              </Field>
              <Field label="עוקבים באינסטגרם" error={E.instagram_followers}>
                <input inputMode="numeric" dir="ltr" value={f.instagram_followers} onChange={(e) => set('instagram_followers')(e.target.value.replace(/\D/g, ''))} placeholder="12000" />
              </Field>
            </div>
            <div className="row2">
              <Field label="טיקטוק" error={E.tiktok_handle}>
                <input dir="ltr" value={f.tiktok_handle} onChange={set('tiktok_handle')} placeholder="username" autoCapitalize="none" />
              </Field>
              <Field label="עוקבים בטיקטוק" error={E.tiktok_followers}>
                <input inputMode="numeric" dir="ltr" value={f.tiktok_followers} onChange={(e) => set('tiktok_followers')(e.target.value.replace(/\D/g, ''))} />
              </Field>
            </div>
            <Field label="ערוץ יוטיוב" error={E.youtube_url}><input dir="ltr" type="url" value={f.youtube_url} onChange={set('youtube_url')} placeholder="https://youtube.com/@..." /></Field>
            <Field label="פלטפורמות נוספות" error={E.other_platforms}><input value={f.other_platforms} onChange={set('other_platforms')} placeholder="בלוג, פייסבוק, פודקאסט…" /></Field>

            <div className="subhead">
              <h3>תיק עבודות</h3>
              <span className="muted">קישורים לשיתופי פעולה או תכנים שאת גאה בהם (עד 10)</span>
            </div>
            {f.links.map((l, i) => (
              <div className="link-row" key={i}>
                <input dir="ltr" type="url" placeholder="https://" value={l.url} onChange={(e) => setLink(i, 'url', e.target.value)} aria-label="קישור" />
                <input placeholder="תיאור (לא חובה)" value={l.label} onChange={(e) => setLink(i, 'label', e.target.value)} aria-label="תיאור" />
                <button type="button" className="icon-btn" aria-label="הסרה" onClick={() => setF((s) => ({ ...s, links: s.links.filter((_, j) => j !== i) }))}>×</button>
                {E[`links.${i}.url`] && <span className="field-error">{E[`links.${i}.url`]}</span>}
              </div>
            ))}
            {f.links.length < 10 && (
              <button type="button" className="btn ghost sm" onClick={() => setF((s) => ({ ...s, links: [...s.links, { url: '', label: '' }] }))}>+ הוספת קישור</button>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h2>הקהל והתחומים שלך</h2>
            <Field label="תחומי תוכן (עד 5)" required error={E.niches}>
              <div className="pills">
                {meta.niches.map((n) => (
                  <button type="button" key={n.id} className={`pill${f.niches.includes(n.id) ? ' on' : ''}`} onClick={() => toggleNiche(n.id)} aria-pressed={f.niches.includes(n.id)}>
                    {n.name}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="הקהל שלך הוא" error={E.audience_gender}>
              <div className="pills">
                {Object.entries(GENDER).map(([k, v]) => (
                  <button type="button" key={k} className={`pill${f.audience_gender === k ? ' on' : ''}`} onClick={() => set('audience_gender')(f.audience_gender === k ? '' : k)}>{v}</button>
                ))}
              </div>
            </Field>
            <div className="row2">
              <Field label="גיל קהל — מ" error={E.audience_age_min}><input inputMode="numeric" dir="ltr" value={f.audience_age_min} onChange={set('audience_age_min')} placeholder="25" /></Field>
              <Field label="עד" error={E.audience_age_max}><input inputMode="numeric" dir="ltr" value={f.audience_age_max} onChange={set('audience_age_max')} placeholder="40" /></Field>
            </div>
            <Field label="מגזר עיקרי של הקהל" error={E.audience_sector}>
              <select value={f.audience_sector} onChange={set('audience_sector')}>
                <option value="">בחרי</option>
                {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </>
        )}

        {step === 3 && (
          <>
            <h2>שיתופי פעולה</h2>
            <div className="toggles">
              <Toggle label="פתוחה לקמפיינים בתשלום" checked={f.open_to_paid} onChange={set('open_to_paid')} />
              <Toggle label="פתוחה לבארטר (מוצר בלבד)" checked={f.open_to_barter} onChange={set('open_to_barter')} />
              <Toggle label="פתוחה לאירועים" checked={f.open_to_events} onChange={set('open_to_events')} />
              <Toggle label="פתוחה לשיווק שותפים" checked={f.open_to_affiliate} onChange={set('open_to_affiliate')} />
            </div>
            <div className="subhead">
              <h3>כתובת למשלוח מוצרים</h3>
              <span className="muted">{f.open_to_barter ? 'לשם יישלחו מוצרים בקמפיינים של בארטר ומשולבים.' : 'נדרשת רק לקמפיינים שנשלח בהם מוצר (בארטר או משולב).'}</span>
            </div>
            <Field label="רחוב ומספר בית" required={f.open_to_barter} error={E.address_street}>
              <input value={f.address_street} onChange={set('address_street')} autoComplete="address-line1" placeholder="הרצל 12" />
            </Field>
            <div className="row2">
              <Field label="דירה / קומה / כניסה" error={E.address_apt}>
                <input value={f.address_apt} onChange={set('address_apt')} autoComplete="address-line2" placeholder="דירה 4, קומה 2" />
              </Field>
              <Field label="עיר" required={f.open_to_barter} error={E.address_city}>
                <input value={f.address_city} onChange={set('address_city')} autoComplete="address-level2" placeholder={f.city || ''} />
              </Field>
            </div>
            <Field label="מיקוד" error={E.address_zip}>
              <input inputMode="numeric" dir="ltr" maxLength={7} value={f.address_zip} onChange={set('address_zip')} autoComplete="postal-code" />
            </Field>
            {(f.address_street || f.open_to_barter) && (
              <label className={`check-confirm${E.address_confirmed ? ' has-error' : ''}`}>
                <input type="checkbox" checked={addressOk} onChange={(e) => { setAddressOk(e.target.checked); setErrors((x) => ({ ...x, address_confirmed: undefined })); }} />
                <span>אני מאשרת שהכתובת נכונה ומעודכנת</span>
              </label>
            )}
            {E.address_confirmed && <span className="field-error">{E.address_confirmed}</span>}

            <Field label="סטטוס עסקי" error={E.billing_status}>
              <select value={f.billing_status} onChange={set('billing_status')}>
                {Object.entries(BILLING).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            {requireTerms && (
              <TermsAcceptance version={terms.version} checked={termsOk} onChange={setTermsOk} error={E.terms_accept} />
            )}
          </>
        )}

        <ErrorBox error={error && !Object.keys(error.fields || {}).length ? error : null} />
        <div className="wizard-nav">
          {step > 0 && <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>הקודם</button>}
          <button className="btn primary grow" disabled={busy}>
            {step < STEPS.length - 1 ? 'המשך' : busy ? 'שומרת…' : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
