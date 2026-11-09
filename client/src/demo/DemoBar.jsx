import { startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { demoLoginAs, resetDemo } from './mockApi.js';

/** Strip across the top of the demo build: switch between Noa and a creator, or reset the data. */
export default function DemoBar() {
  const { me, refresh, setMe } = useAuth();
  const nav = useNavigate();
  const role = me?.user?.role;

  const as = async (r) => {
    demoLoginAs(r);
    await refresh();
    nav(r === 'admin' ? '/admin' : '/dashboard');
  };
  const reset = () => {
    resetDemo();
    // React Router navigates inside a transition; put the logout in the same one so the
    // protected page unmounts before its auth guard can bounce to /login.
    startTransition(() => {
      setMe(null);
      nav('/');
    });
  };

  return (
    <div className="demo-bar" role="region" aria-label="גרסת הדגמה">
      <span className="grow"><b>גרסת הדגמה</b> · נתונים לדוגמה, נשמרים רק בדפדפן שלך</span>
      <button type="button" className={role === 'admin' ? 'on' : ''} onClick={() => as('admin')}>מבט של נועה</button>
      <button type="button" className={role === 'creator' ? 'on' : ''} onClick={() => as('creator')}>מבט של יוצרת</button>
      <button type="button" onClick={reset}>איפוס</button>
    </div>
  );
}
