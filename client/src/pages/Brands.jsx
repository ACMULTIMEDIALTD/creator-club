import BuiltBy from '../components/BuiltBy.jsx';
import logoUrl from '../assets/logo.jpg';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Field, ErrorBox } from '../components/ui.jsx';

export default function Brands() {
  const [form, setForm] = useState({ name: '', brand: '', phone: '', email: '', message: '', website: '' });
  const [state, setState] = useState({ busy: false, done: false, error: null });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, done: false, error: null });
    try {
      await api.post('/public/brand-inquiry', form);
      setState({ busy: false, done: true, error: null });
    } catch (err) {
      setState({ busy: false, done: false, error: err });
    }
  };
  const fe = state.error?.fields || {};

  return (
    <div className="landing narrow">
      <div className="landing-top"><Link to="/" className="linklike">→ חזרה</Link></div>
      <img src={logoUrl} alt="" className="hero-logo sm" width="120" height="120" />
      <h1>עבודה עם יוצרות הקהילה</h1>
      <p className="lead">ספרו לי על המותג ועל מה שאתם מחפשים, ואחזור אליכם באופן אישי.</p>
      {state.done ? (
        <div className="card center">
          <h2>תודה! 💌</h2>
          <p>הפנייה התקבלה. אחזור אליכם בהקדם.</p>
        </div>
      ) : (
        <form className="card form" onSubmit={submit} noValidate>
          <Field label="שם מלא" required error={fe.name}><input value={form.name} onChange={set('name')} autoComplete="name" /></Field>
          <Field label="שם המותג" required error={fe.brand}><input value={form.brand} onChange={set('brand')} autoComplete="organization" /></Field>
          <Field label="טלפון" required error={fe.phone}><input type="tel" dir="ltr" value={form.phone} onChange={set('phone')} autoComplete="tel" /></Field>
          <Field label="מייל" required error={fe.email}><input type="email" dir="ltr" value={form.email} onChange={set('email')} autoComplete="email" /></Field>
          <Field label="ספרו לי בקצרה" error={fe.message}><textarea rows={4} value={form.message} onChange={set('message')} /></Field>
          <input className="hp" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} aria-hidden="true" />
          <ErrorBox error={state.error && !Object.keys(fe).length ? state.error : null} />
          <button className="btn primary block" disabled={state.busy}>{state.busy ? 'שולחת…' : 'שליחה'}</button>
        </form>
      )}
      <footer className="landing-footer"><BuiltBy /></footer>
    </div>
  );
}
