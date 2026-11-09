import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, Spinner } from '../auth.jsx';

const safeNext = (n) => (n && /^\/(?![/\\])/.test(n) ? n : null);

/** Landing page of the emailed sign-in link. Same URL works in a browser and opens the app on a phone. */
export default function MagicLink() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [error, setError] = useState(null);
  const once = useRef(false); // StrictMode runs effects twice in dev; the link is single-use

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    (async () => {
      try {
        const { user } = await api.post('/auth/magic', { token });
        await refresh();
        nav(safeNext(params.get('next')) || (user.role === 'admin' ? '/admin' : '/dashboard'), { replace: true });
      } catch (e) {
        setError(e);
      }
    })();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!error) return <Spinner full />;
  return (
    <div className="narrow card center">
      <h1>הקישור לא בתוקף</h1>
      <p>{error.message}</p>
      <Link to="/login" className="btn primary">לבקשת קישור חדש</Link>
    </div>
  );
}
