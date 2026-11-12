# The Creator Club · קהילת היוצרות של נועה אביטל

אפליקציה סגורה לניהול קהילת היוצרות: הרשמה ופרופיל מלא, אישור תנאים (click-wrap), לוח קמפיינים עם בדיקת התאמה, הגשת מועמדות, בחירת יוצרות וייצוא למותג.

```
server/   Node + Express + PostgreSQL  → Render
client/   React + Vite (RTL, mobile-first) → Vercel
```

## iPhone & Android app

The same React app ships as a Capacitor app (`client/ios`, `client/android`) with push notifications and links that open in the app, and as an installable PWA. Setup, store checklist and keys are in [MOBILE.md](MOBILE.md).

## Demo (no server)

`cd client && npm run build:demo` builds a self-contained demo into `client/dist-demo/`. It is the real UI with a simulated API running in the browser (`client/src/demo/`), uses invented sample data and has a bar for switching between Noa's view and a creator's view. Any static host can serve it.
The `Demo → GitHub Pages` workflow publishes it to https://acmultimedialtd.github.io/creator-club/ on every push to `main`. One-time setup: Settings → Pages → Source: **GitHub Actions**.
`node scripts/demo-single-file.mjs out.html` (run from `client/`) inlines the demo into a single HTML file.
The production build (`npm run build`) contains none of the demo code.

## Local development

Requires Node 22.9+ and PostgreSQL 14+.

```bash
createdb creator_club
cd server
cp .env.example .env        # edit ADMIN_EMAIL / ADMIN_PASSWORD
npm install
npm run setup               # migrations + seed (niches, regions, admin)
npm run dev                 # API on :4000

cd ../client
npm install
npm run dev                 # app on :5173, proxies /api → :4000
```

Without `SMTP_URL`, emails (magic links, approvals, selections) are printed to the API log, so you can click magic links locally.

Extra admin: `npm run create-admin -- idan@example.com 'password'`.

### Tests

```bash
createdb creator_club_test
cd server && npm test       # uses TEST_DATABASE_URL or postgres://postgres:postgres@localhost:5432/creator_club_test
```
The integration suite drops and recreates the `public` schema of that database. Never point it at real data.

## Deploy

**API (Render).** `render.yaml` is a Blueprint for the web service and the database. Set `APP_URL`, `CORS_ORIGIN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `WHATSAPP_GROUP_URL`, `TERMS_PDF_URL` and the SMTP settings. Migrations run on every boot, and the seed is idempotent.

**Client (Vercel).** Set the project root to `client/`. Before deploying, change the API host in `client/vercel.json` to your Render URL. Vercel proxies `/api/*` to Render, so the session cookie is first-party (`SameSite=Lax`). That matters because Safari and in-app browsers such as WhatsApp's block third-party cookies. If you call the API cross-origin instead, set `COOKIE_SAMESITE=none`.

## Key rules (enforced server-side)

| Rule | Where |
|---|---|
| Eligibility with reason codes (status, terms, deadline, type, followers, niche, region, duplicate) | `server/src/lib/eligibility.js` |
| `full_brief` / `payment_note` only for selected creators, never in list endpoints | `server/src/routes/campaigns.js` |
| Terms version + timestamp + IP stored. Bumping `CURRENT_TERMS_VERSION` forces a re-accept modal | `routes/me.js`, `TermsModal.jsx` |
| New signups are `pending` until Noa approves; the WhatsApp group link is shown only to active members | `routes/admin/creators.js`, `routes/auth.js` |
| Closing a campaign auto-rejects all pending applications ("לא הפעם, את במאגר להבא") | `routes/admin/campaigns.js` |
| Only `/`, `/join`, `/brands` and `/login` are public. `/c/:slug` redirects to login with `?next=` | `client/src/auth.jsx` |

## Notes / decisions beyond the spec
- Magic-link tokens are stored as SHA-256 hashes, are single-use and expire after 30 minutes.
- Pending creators see a locked board. Campaign cards are part of what membership gives them.
- A creator who withdraws can apply again while the campaign is open.
- `POST /me/terms` is the endpoint behind the re-accept modal. `GET /public/meta` serves the niches and regions lists. `POST /public/brand-inquiry` emails Noa from `/brands` and has a honeypot field against spam.
- `GET /admin/overview` powers the admin "today" screen.
- CSV exports include a UTF-8 BOM so Excel shows Hebrew correctly, and they guard against formula injection.

## Planning docs and tools (Hebrew)

- [Feasibility study](docs/01-feasibility.md), [lean launch plan](docs/02-lean-plan.md), [improvement research](docs/03-improvements.md)
- [Creator follower sync](tools/creator_sync/README.md): checks the follower counts creators declare against Instagram
