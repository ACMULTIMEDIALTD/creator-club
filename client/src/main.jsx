import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { DEMO } from './demo/flag.js';
import { IS_NATIVE } from './native/platform.js';
import { AuthProvider } from './auth.jsx';
import App from './App.jsx';
import './styles.css';

// The demo runs inside an embedded frame / static host, so routing stays in memory.
const Router = DEMO ? MemoryRouter : BrowserRouter;
if (IS_NATIVE) document.documentElement.classList.add('native');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Router>
  </StrictMode>,
);

// Installable website (PWA). Not in the native app (it has its own shell) or the demo build.
if (import.meta.env.PROD && !DEMO && !IS_NATIVE && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// "נגיש לי" accessibility widget (nagish.li, v2.3, LGPL), served from /public/nagishli.
// Loaded after the app so it never delays the first screen. Not in the demo build, which can't load extra files.
if (!DEMO) {
  Object.assign(window, {
    nl_lang: 'he',
    nl_pos: 'bl', // bottom-left: the right side has the app's own buttons in RTL
    nl_color: 'red', // closest of the widget's palettes to the brand burgundy
    nl_dir: '/nagishli/nl-files/',
    nl_link: '/accessibility', // the widget's "accessibility statement" item opens our page
  });
  const load = (src, onload) => {
    const s = document.createElement('script');
    s.src = src;
    s.charset = 'utf-8';
    if (onload) s.onload = onload;
    document.body.appendChild(s);
  };
  // The widget would otherwise fetch jQuery 1.8 (2012, known vulnerabilities) from code.jquery.com.
  // With jQuery already on the page it uses ours: current and served from our own site.
  load('/nagishli/jquery-3.7.1.min.js', () => load('/nagishli/nagishli.js?v=2.3'));
}
