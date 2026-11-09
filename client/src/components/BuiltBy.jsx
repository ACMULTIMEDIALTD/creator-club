import { Link } from 'react-router-dom';

/** Bottom of every screen: accessibility statement link + developer credit. */
export default function BuiltBy() {
  return (
    <p className="built-by">
      <Link to="/accessibility">הצהרת נגישות</Link>
      {' · '}
      מערכת זו נבנתה על ידי{' '}
      <a href="https://an-web.co.il" target="_blank" rel="noopener">A.N Web Design</a>
    </p>
  );
}
