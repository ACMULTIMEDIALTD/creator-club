import logoUrl from '../assets/logo.jpg';
import { startTransition } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import TermsModal from './TermsModal.jsx';
import BuiltBy from './BuiltBy.jsx';

export function Logo({ size = 44 }) {
  return <img src={logoUrl} alt="The Creator Club by Noa Avital" width={size} height={size} className="logo" />;
}

export default function Layout() {
  const { me, logout, setMe } = useAuth();
  const nav = useNavigate();
  const role = me?.user?.role;
  const home = role === 'admin' ? '/admin' : me ? '/dashboard' : '/';

  const doLogout = async () => {
    await logout({ keepState: true });
    // Same transition as the navigation, so the protected page unmounts before its guard redirects to /login
    startTransition(() => {
      setMe(null);
      nav('/');
    });
  };

  return (
    <div className={role === 'admin' ? 'app admin' : 'app'}>
      <header className="topbar">
        <Link to={home} className="brand"><Logo size={40} /><span>The Creator Club</span></Link>
        {me && !me.needs_profile && (
          <nav className="topnav">
            {role === 'admin' ? (
              <>
                <NavLink to="/admin" end>היום</NavLink>
                <NavLink to="/admin/creators">יוצרות</NavLink>
                <NavLink to="/admin/campaigns">קמפיינים</NavLink>
                <NavLink to="/admin/payments">תשלומים</NavLink>
                <NavLink to="/admin/brands">מותגים</NavLink>
              </>
            ) : (
              <>
                <NavLink to="/dashboard">ראשי</NavLink>
                <NavLink to="/me/applications">ההגשות שלי</NavLink>
                <NavLink to="/me" end>פרופיל</NavLink>
              </>
            )}
            <button type="button" className="linklike" onClick={doLogout}>יציאה</button>
          </nav>
        )}
      </header>
      <main className="container">
        <Outlet />
      </main>
      <footer className="app-footer"><BuiltBy /></footer>
      {me?.needs_terms && <TermsModal />}
    </div>
  );
}
