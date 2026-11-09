import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from './api.js';
import { setToken } from './native/platform.js';
import { currentPushToken } from './native/push.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [me, setMe] = useState(undefined); // undefined = loading, null = logged out

  const refresh = useCallback(async () => {
    try {
      setMe(await api.get('/auth/me'));
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const logout = async ({ keepState = false } = {}) => {
    // push_token: stop sending this phone notifications for the account that is signing out
    await api.post('/auth/logout', { push_token: currentPushToken() }).catch(() => {});
    await setToken(null);
    if (!keepState) setMe(null);
  };

  return <AuthContext.Provider value={{ me, refresh, logout, setMe }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function Spinner({ full }) {
  return <div className={full ? 'spinner-wrap full' : 'spinner-wrap'}><div className="spinner" aria-label="טוען" /></div>;
}

/** Gate for authenticated pages. Unauthenticated → /login?next=<current path> (spec §3.7). */
export function RequireAuth({ role, children }) {
  const { me } = useAuth();
  const loc = useLocation();
  if (me === undefined) return <Spinner full />;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (role && me.user.role !== role) return <Navigate to={me.user.role === 'admin' ? '/admin' : '/dashboard'} replace />;
  // Creators who signed up but never finished the wizard go back to it
  if (me.needs_profile && !loc.pathname.startsWith('/join')) return <Navigate to="/join" replace />;
  return children;
}
