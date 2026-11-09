const env = process.env;
const isProd = env.NODE_ENV === 'production';

if (isProd && (!env.JWT_SECRET || env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be set (32+ chars) in production');
}

export const config = {
  isProd,
  isTest: env.NODE_ENV === 'test',
  port: Number(env.PORT) || 4000,
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/creator_club',
  databaseSsl: env.DATABASE_SSL === 'true',
  jwtSecret: env.JWT_SECRET || 'dev-only-secret-do-not-use-in-production',
  appUrl: (env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  corsOrigins: [
    ...(env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
    // The Capacitor app's WebView origins (iOS, Android)
    'capacitor://localhost', 'https://localhost',
  ],
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProd,
  cookieSameSite: (env.COOKIE_SAMESITE || 'lax').toLowerCase(),
  termsVersion: env.CURRENT_TERMS_VERSION || '2026-10-v2',
  termsPdfUrl: env.TERMS_PDF_URL || '',
  whatsappGroupUrl: env.WHATSAPP_GROUP_URL || '',
  adminEmail: env.ADMIN_EMAIL || '',
  adminPassword: env.ADMIN_PASSWORD || '',
  smtpUrl: env.SMTP_URL || '',
  // Without SMTP in production nothing can be emailed, so sign-in links are switched off and a
  // password is required at signup. In dev/test mail is printed to the log instead.
  mailEnabled: !!env.SMTP_URL || !isProd,
  mailFrom: env.MAIL_FROM || 'no-reply@example.com',
  notifyEmail: env.NOTIFY_EMAIL || env.ADMIN_EMAIL || '',
  // Where creators' replies to our emails go (a real inbox helps deliverability). Defaults to Noa.
  mailReplyTo: env.MAIL_REPLY_TO || env.NOTIFY_EMAIL || env.ADMIN_EMAIL || '',
  // Firebase service-account JSON (one line) — enables push notifications to the app
  firebaseServiceAccount: env.FIREBASE_SERVICE_ACCOUNT || '',
  // Apple push (APNs) for the iPhone app: an auth key (.p8) from developer.apple.com → Keys
  apns: {
    key: (env.APNS_KEY || '').replace(/\\n/g, '\n'),
    keyId: env.APNS_KEY_ID || '',
    teamId: env.APNS_TEAM_ID || '',
    bundleId: env.APNS_BUNDLE_ID || '',
    production: env.APNS_PRODUCTION !== 'false',
  },
};
