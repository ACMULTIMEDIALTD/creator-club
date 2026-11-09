import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, assetUrl } from '../../api.js';
import { resizeImage } from '../../lib/resizeImage.js';
import { Spinner } from '../../auth.jsx';
import { PLATFORMS, TYPE_LABELS } from '../../labels.js';
import { Field, ErrorBox } from '../../components/ui.jsx';

const pad = (n) => String(n).padStart(2, '0');
/** ISO → value for <input type="datetime-local"> in the browser's local (Israel) time */
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const inDays = (n) => { const d = new Date(Date.now() + n * 864e5); d.setHours(23, 59, 0, 0); return toLocalInput(d); };

const EMPTY = {
  title: '', brand_id: '', brand_display_name: '', short_description: '', full_brief: '', payment_note: '',
  type: 'paid', product_value_ils: '', min_followers: '0', platforms: ['instagram'], required_niche_ids: [], region_ids: [],
  slots: '5', deadline_apply: inDays(5), deadline_publish: '', slug: '', image_id: null, image_url: null,
};

function ImagePicker({ url, onChange, error }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const blob = await resizeImage(file);
      const r = await api.upload('/admin/images', blob);
      onChange(r.id, r.url);
    } catch (ex) {
      setErr(ex.message === 'not_image' || ex.message === 'decode_failed' ? 'הקובץ הזה לא נראה כמו תמונה' : ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field">
      <span className="field-label">תמונה לקמפיין</span>
      {url ? (
        <div className="image-preview">
          <img src={assetUrl(url)} alt="תמונת הקמפיין" />
          <div className="row-inline">
            <label className="btn ghost sm">החלפה<input type="file" accept="image/*" hidden onChange={pick} disabled={busy} /></label>
            <button type="button" className="btn ghost sm" onClick={() => onChange(null, null)} disabled={busy}>הסרה</button>
          </div>
        </div>
      ) : (
        <label className={`image-drop${busy ? ' busy' : ''}`}>
          <input type="file" accept="image/*" hidden onChange={pick} disabled={busy} />
          <span className="image-drop-icon" aria-hidden="true">🖼</span>
          <span>{busy ? 'מעלה…' : 'בחירת תמונה'}</span>
          <span className="hint">לא חובה. מופיעה בכרטיס הקמפיין ובעמוד שלו.</span>
        </label>
      )}
      {(err || error) && <span className="field-error">{err || error}</span>}
    </div>
  );
}

export default function AdminCampaignForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const [f, setF] = useState(id ? null : EMPTY);
  const [meta, setMeta] = useState(null);
  const [brands, setBrands] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/public/meta').then(setMeta).catch(setError);
    api.get('/admin/brands').then((r) => setBrands(r.brands)).catch(setError);
    if (id) {
      api.get(`/admin/campaigns/${id}`).then(({ campaign: c }) => setF({
        ...EMPTY,
        ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, c[k] ?? EMPTY[k]])),
        brand_id: c.brand_id || '',
        product_value_ils: c.product_value_ils ?? '',
        min_followers: String(c.min_followers),
        slots: String(c.slots),
        required_niche_ids: c.required_niche_ids || [],
        region_ids: c.region_ids || [],
        deadline_apply: toLocalInput(c.deadline_apply),
        deadline_publish: c.deadline_publish || '',
        image_id: c.image_id || null,
        image_url: c.image_url || null,
        status: c.status,
      })).catch(setError);
    }
  }, [id]);

  if (!f || !meta) return error ? <ErrorBox error={error} /> : <Spinner />;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleIn = (k, v) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] });
  const pickBrand = (e) => {
    const b = brands.find((x) => x.id === e.target.value);
    setF({ ...f, brand_id: e.target.value, brand_display_name: f.brand_display_name || b?.name || '' });
  };

  const save = async (publish) => {
    setBusy(true);
    setError(null);
    const body = {
      ...f,
      deadline_apply: f.deadline_apply ? new Date(f.deadline_apply).toISOString() : '',
      slug: f.slug || undefined,
    };
    delete body.status;
    delete body.image_url;
    try {
      if (id) {
        await api.patch(`/admin/campaigns/${id}`, body);
        nav(`/admin/campaigns/${id}`);
      } else {
        const { campaign } = await api.post('/admin/campaigns', { ...body, status: publish ? 'open' : 'draft' });
        nav(`/admin/campaigns/${campaign.id}`);
      }
    } catch (e) {
      setError(e);
      window.scrollTo(0, 0);
    } finally {
      setBusy(false);
    }
  };
  const E = error?.fields || {};

  return (
    <div className="narrow wide-sm">
      <Link to={id ? `/admin/campaigns/${id}` : '/admin/campaigns'} className="back">→ חזרה</Link>
      <h1 className="page-title">{id ? 'עריכת קמפיין' : 'קמפיין חדש'}</h1>
      <ErrorBox error={error} />
      <form className="card form" onSubmit={(e) => { e.preventDefault(); save(false); }} noValidate>
        <h2>מה רואות כולן</h2>
        <ImagePicker url={f.image_url} error={E.image_id} onChange={(image_id, image_url) => setF((cur) => ({ ...cur, image_id, image_url }))} />
        <Field label="כותרת" required error={E.title}><input value={f.title} onChange={set('title')} placeholder="השקת קרם פנים חדש" /></Field>
        <div className="row2">
          <Field label="מותג (פנימי)" error={E.brand_id}>
            <select value={f.brand_id} onChange={pickBrand}>
              <option value="">—</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="שם מותג לתצוגה" required error={E.brand_display_name} hint="אפשר להסתיר: ״מותג קוסמטיקה מוביל״">
            <input value={f.brand_display_name} onChange={set('brand_display_name')} />
          </Field>
        </div>
        <Field label="תיאור קצר" required error={E.short_description} hint={`מופיע בלוח ובהודעת הווטסאפ · ${f.short_description.length}/400`}>
          <textarea rows={3} maxLength={400} value={f.short_description} onChange={set('short_description')} />
        </Field>
        <Field label="סוג" required error={E.type}>
          <div className="pills">
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <button type="button" key={k} className={`pill${f.type === k ? ' on' : ''}`} onClick={() => setF({ ...f, type: k })}>{v}</button>
            ))}
          </div>
        </Field>
        <div className="row3">
          <Field label="מינימום עוקבים" error={E.min_followers}><input inputMode="numeric" dir="ltr" value={f.min_followers} onChange={set('min_followers')} /></Field>
          <Field label="מקומות" required error={E.slots}><input inputMode="numeric" dir="ltr" value={f.slots} onChange={set('slots')} /></Field>
          {f.type !== 'paid' && <Field label="שווי מוצר (₪)" error={E.product_value_ils}><input inputMode="numeric" dir="ltr" value={f.product_value_ils} onChange={set('product_value_ils')} /></Field>}
        </div>
        <div className="row2">
          <Field label="הגשה עד" required error={E.deadline_apply}><input type="datetime-local" value={f.deadline_apply} onChange={set('deadline_apply')} /></Field>
          <Field label="פרסום עד" error={E.deadline_publish}><input type="date" value={f.deadline_publish} onChange={set('deadline_publish')} /></Field>
        </div>
        <Field label="פלטפורמות" error={E.platforms}>
          <div className="pills">
            {Object.entries(PLATFORMS).map(([k, v]) => (
              <button type="button" key={k} className={`pill${f.platforms.includes(k) ? ' on' : ''}`} onClick={() => toggleIn('platforms', k)}>{v}</button>
            ))}
          </div>
        </Field>
        <Field label="רק לתחומים (לא חובה)" error={E.required_niche_ids}>
          <div className="pills">
            {meta.niches.map((n) => (
              <button type="button" key={n.id} className={`pill${f.required_niche_ids.includes(n.id) ? ' on' : ''}`} onClick={() => toggleIn('required_niche_ids', n.id)}>{n.name}</button>
            ))}
          </div>
        </Field>
        <Field label="רק לאזורים (לא חובה)" error={E.region_ids}>
          <div className="pills">
            {meta.regions.map((r) => (
              <button type="button" key={r.id} className={`pill${f.region_ids.includes(r.id) ? ' on' : ''}`} onClick={() => toggleIn('region_ids', r.id)}>{r.name}</button>
            ))}
          </div>
        </Field>

        <h2>רק לנבחרות 🔒</h2>
        <Field label="תנאי תשלום" error={E.payment_note} hint="למשל: ₪400 לרילס + מוצר"><textarea rows={2} value={f.payment_note} onChange={set('payment_note')} /></Field>
        <Field label="בריף מלא" error={E.full_brief}><textarea rows={10} value={f.full_brief} onChange={set('full_brief')} /></Field>

        <details className="muted-details">
          <summary>מתקדם</summary>
          <Field label="כתובת (slug)" error={E.slug} hint="ריק = אוטומטי. אותיות באנגלית, ספרות ומקפים.">
            <input dir="ltr" value={f.slug} onChange={set('slug')} placeholder="loreal-oct" />
          </Field>
        </details>

        <div className="wizard-nav">
          <button className="btn ghost" disabled={busy}>{id ? 'שמירה' : 'שמירה כטיוטה'}</button>
          {!id && <button type="button" className="btn primary grow" disabled={busy} onClick={() => save(true)}>שמירה ופתיחה להגשות</button>}
        </div>
      </form>
    </div>
  );
}
