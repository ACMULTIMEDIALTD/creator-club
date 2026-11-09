import { useEffect, useRef, useState } from 'react';
import TermsContent from './TermsContent.jsx';

/**
 * Terms in a scrollable sheet, so reading them doesn't leave the signup wizard.
 * With onReadToEnd, the confirm button unlocks only after the reader has scrolled to the bottom.
 */
export default function TermsDialog({ onClose, onReadToEnd }) {
  const bodyRef = useRef(null);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const check = () => {
    const el = bodyRef.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setAtEnd(true);
  };
  // A tall screen may show everything without scrolling
  useEffect(() => { check(); }, []);

  const confirm = () => { onReadToEnd(); onClose(); };

  return (
    <div className="modal-backdrop top" role="dialog" aria-modal="true" aria-label="תנאי הצטרפות לקהילה" onClick={onClose}>
      <div className="modal sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>תנאי הצטרפות לקהילה</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="סגירה">×</button>
        </div>
        <div className="sheet-body" ref={bodyRef} onScroll={check}><TermsContent /></div>
        {onReadToEnd ? (
          <button type="button" className="btn primary block" disabled={!atEnd} onClick={confirm}>
            {atEnd ? 'קראתי את התנאים' : 'יש לגלול עד סוף התנאים ↓'}
          </button>
        ) : (
          <button type="button" className="btn primary block" onClick={onClose}>סגירה</button>
        )}
      </div>
    </div>
  );
}
