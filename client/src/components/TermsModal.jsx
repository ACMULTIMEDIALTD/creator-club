import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import TermsAcceptance from './TermsAcceptance.jsx';

/** Forced re-accept when CURRENT_TERMS_VERSION moves past the creator's accepted version (spec §3.3). */
export default function TermsModal() {
  const { me, refresh } = useAuth();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const accept = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/me/terms', { version: me.terms.version, read_to_end: true });
      await refresh();
    } catch (e) {
      setError(e.message);
      if (e.code === 'terms_version_mismatch') await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="terms-title">
      <div className="modal">
        <h2 id="terms-title">עדכנו את תנאי הקהילה</h2>
        <p>כדי להמשיך להגיש מועמדות לקמפיינים, צריך לקרוא ולאשר את הגרסה המעודכנת של התנאים.</p>
        <TermsAcceptance version={me.terms.version} checked={checked} onChange={setChecked} />
        {error && <div className="alert error">{error}</div>}
        <button className="btn primary block" disabled={!checked || busy} onClick={accept}>
          {busy ? 'שומרת…' : 'אישור והמשך'}
        </button>
      </div>
    </div>
  );
}
