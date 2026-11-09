import logoUrl from '../assets/logo.jpg';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import BuiltBy from '../components/BuiltBy.jsx';

export default function Landing() {
  const { me } = useAuth();
  const home = me?.user?.role === 'admin' ? '/admin' : '/dashboard';

  return (
    <div className="landing">
      <div className="landing-top">
        {me ? <Link to={home} className="linklike">לאזור האישי ←</Link> : <Link to="/login" className="linklike">כניסה לחברות</Link>}
      </div>
      <section className="hero">
        <img src={logoUrl} alt="The Creator Club by Noa Avital" className="hero-logo" width="220" height="220" />
        <h1>קהילת יוצרות התוכן של נועה אביטל</h1>
        <p className="lead">
          קהילה סגורה ונבחרת של יוצרות תוכן ישראליות.
          <br />
          כל יוצרת מוכרת לי אישית, וכל קמפיין מותאם בקפידה.
        </p>
        <div className="cta-row">
          <Link to="/join" className="btn primary lg">אני יוצרת</Link>
          <Link to="/brands" className="btn outline lg">אני מותג</Link>
        </div>
      </section>

      <section className="pillars">
        <div className="pillar">
          <h3>אישי</h3>
          <p>אני מכירה כל יוצרת בקהילה, ומחברת בין מותגים ליוצרות שבאמת מתאימות להם.</p>
        </div>
        <div className="pillar">
          <h3>נבחר</h3>
          <p>אנחנו גדלות לאט ובכוונה. כל הצטרפות לקהילה עוברת אישור אישי.</p>
        </div>
        <div className="pillar">
          <h3>מהיר</h3>
          <p>קמפיין חדש? היוצרות המתאימות רואות אותו מיד ומגישות מועמדות בלחיצה.</p>
        </div>
      </section>

      <footer className="landing-footer">
        © The Creator Club · Noa Avital · <Link to="/terms">תנאי הקהילה ופרטיות</Link>
        <BuiltBy />
      </footer>
    </div>
  );
}
