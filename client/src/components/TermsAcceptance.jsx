import { useState } from 'react';
import TermsDialog from './TermsDialog.jsx';

/**
 * Click-wrap: the "I agree" box stays locked until the creator opened the terms and scrolled to the
 * end. `checked` is only ever true after that, so the caller can send read_to_end: true with it.
 */
export default function TermsAcceptance({ version, checked, onChange, error }) {
  const [read, setRead] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <div className={`terms-box${error ? ' has-error' : ''}`}>
      <button type="button" className={`btn ${read ? 'ghost' : 'outline'} sm terms-read-btn`} onClick={() => setOpen(true)}>
        {read ? '✓ קראת את התנאים' : 'קריאת תנאי ההצטרפות'}
      </button>
      <label className={`check${read ? '' : ' locked'}`} onClick={(e) => { if (!read) { e.preventDefault(); setOpen(true); } }}>
        <input type="checkbox" checked={checked} disabled={!read} onChange={(e) => onChange(e.target.checked)} />
        <span>
          קראתי ואני מסכימה לתנאי ההצטרפות לקהילה (גרסה <bdi dir="ltr">{version}</bdi>)
          {!read && <span className="hint block">אפשר לסמן אחרי שקוראים את התנאים עד הסוף</span>}
        </span>
      </label>
      {error && <span className="field-error">{error}</span>}
      {open && <TermsDialog onClose={() => setOpen(false)} onReadToEnd={() => { setRead(true); onChange(true); }} />}
    </div>
  );
}
