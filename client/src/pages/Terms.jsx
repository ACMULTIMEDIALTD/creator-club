import BuiltBy from '../components/BuiltBy.jsx';
import { Link } from 'react-router-dom';
import logoUrl from '../assets/logo.jpg';
import TermsContent from '../components/TermsContent.jsx';

/** Public page with the community terms. Also the privacy-policy link for the app stores (/terms#privacy). */
export default function Terms() {
  return (
    <div className="landing narrow terms-page">
      <div className="landing-top"><Link to="/" className="linklike">→ חזרה</Link></div>
      <img src={logoUrl} alt="" className="hero-logo sm" width="120" height="120" />
      <h1>תנאי הצטרפות לקהילה</h1>
      <div className="card"><TermsContent /></div>
      <footer className="landing-footer"><BuiltBy /></footer>
    </div>
  );
}
