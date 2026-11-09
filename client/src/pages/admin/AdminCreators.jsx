import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api.js';
import { Spinner } from '../../auth.jsx';
import { USER_STATUS, TIERS, fmtK } from '../../labels.js';
import { ErrorBox, Empty, UserStatusChip, DownloadLink, igUrl } from '../../components/ui.jsx';
import CreatorDrawer from './CreatorDrawer.jsx';

const FILTER_KEYS = ['q', 'niche', 'region', 'min_followers', 'tier', 'status', 'open_to', 'sort'];
const FOLLOWER_STEPS = [0, 1000, 3000, 5000, 10000, 20000, 50000, 100000];

export default function AdminCreators() {
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || '']));
  const openId = params.get('open');
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState(filters.q);
  const [showFilters, setShowFilters] = useState(false);

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v === '' || v == null) next.delete(k); else next.set(k, v);
    setParams(next, { replace: true });
  };

  const query = qs(filters);
  const load = useCallback(() => api.get(`/admin/creators${query}`).then((r) => setRows(r.creators)).catch(setError), [query]);
  useEffect(() => { api.get('/public/meta').then(setMeta).catch(setError); }, []);
  useEffect(() => { load(); }, [load]);
  // debounce search box → URL
  useEffect(() => {
    const t = setTimeout(() => q !== filters.q && setParam('q', q), 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const followerIdx = Math.max(0, FOLLOWER_STEPS.indexOf(Number(filters.min_followers) || 0));
  const activeFilters = FILTER_KEYS.filter((k) => k !== 'q' && k !== 'sort' && filters[k]).length;

  return (
    <div className="admin-creators">
      <div className="page-head">
        <h1 className="page-title">יוצרות {rows && <span className="muted">({rows.length})</span>}</h1>
        <div className="row-inline">
          <DownloadLink className="btn ghost sm" href={`/api/v1/admin/creators/export.csv${query}`}>קובץ לנועה (עם שמות)</DownloadLink>
          <DownloadLink className="btn ghost sm" href={`/api/v1/admin/creators/export-brands.csv${query}`}>קובץ ללקוחות (בלי שמות)</DownloadLink>
        </div>
      </div>

      <div className="toolbar">
        <input type="search" placeholder="חיפוש: שם, מייל, טלפון, @handle, עיר או קוד C-…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn ghost sm filters-toggle" onClick={() => setShowFilters(!showFilters)}>סינון{activeFilters ? ` (${activeFilters})` : ''}</button>
      </div>

      <div className="with-sidebar">
        <aside className={`filters${showFilters ? ' open' : ''}`}>
          <label>סטטוס
            <select value={filters.status} onChange={(e) => setParam('status', e.target.value)}>
              <option value="">הכל</option>
              {Object.entries(USER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>תחום
            <select value={filters.niche} onChange={(e) => setParam('niche', e.target.value)}>
              <option value="">הכל</option>
              {meta?.niches.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </label>
          <label>אזור
            <select value={filters.region} onChange={(e) => setParam('region', e.target.value)}>
              <option value="">הכל</option>
              {meta?.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label>מינימום עוקבים: <b>{followerIdx ? fmtK(FOLLOWER_STEPS[followerIdx]) : 'ללא'}</b>
            <input type="range" min="0" max={FOLLOWER_STEPS.length - 1} value={followerIdx}
              onChange={(e) => setParam('min_followers', FOLLOWER_STEPS[e.target.value] || '')} />
          </label>
          <label>דרגה
            <select value={filters.tier} onChange={(e) => setParam('tier', e.target.value)}>
              <option value="">הכל</option>
              {Object.entries(TIERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>פתוחה ל
            <select value={filters.open_to} onChange={(e) => setParam('open_to', e.target.value)}>
              <option value="">הכל</option>
              <option value="paid">תשלום</option>
              <option value="barter">בארטר</option>
              <option value="events">אירועים</option>
              <option value="affiliate">שותפים</option>
            </select>
          </label>
          <label>מיון
            <select value={filters.sort} onChange={(e) => setParam('sort', e.target.value)}>
              <option value="">הצטרפות (חדש קודם)</option>
              <option value="followers">עוקבים</option>
              <option value="name">שם</option>
            </select>
          </label>
          {activeFilters > 0 && <button className="linklike" onClick={() => { setParams({}, { replace: true }); setQ(''); }}>ניקוי סינון</button>}
        </aside>

        <div className="table-wrap">
          <ErrorBox error={error} />
          {!rows ? <Spinner /> : !rows.length ? <Empty>אין תוצאות.</Empty> : (
            <table className="table">
              <thead>
                <tr><th>שם</th><th>אינסטגרם</th><th>עוקבים</th><th className="hide-sm">תחומים</th><th className="hide-sm">אזור</th><th>דרגה</th><th>סטטוס</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setParam('open', r.id)} className={openId === r.id ? 'selected' : ''}>
                    <td><b>{r.full_name || <span className="muted" dir="ltr">{r.email}</span>}</b>{!r.has_profile && <span className="chip muted">ללא פרופיל</span>}</td>
                    <td>{r.instagram_handle && <a href={igUrl(r.instagram_handle)} target="_blank" rel="noreferrer" dir="ltr" onClick={(e) => e.stopPropagation()}>@{r.instagram_handle}</a>}</td>
                    <td className="num">{r.has_profile ? fmtK(r.max_followers) : ''}</td>
                    <td className="hide-sm small">{r.niches.join(', ')}</td>
                    <td className="hide-sm small">{r.region_name}</td>
                    <td>{r.tier && <span className={`tier tier-${r.tier}`}>{TIERS[r.tier]}</span>}</td>
                    <td><UserStatusChip status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {openId && <CreatorDrawer id={openId} meta={meta} onClose={() => setParam('open', '')} onChanged={load} />}
    </div>
  );
}
