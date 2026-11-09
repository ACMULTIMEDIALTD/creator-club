import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { scheduleSignupCleanup } from './lib/signupCleanup.js';

process.on('unhandledRejection', (err) => console.error('unhandled rejection:', err));

// Migrations are idempotent; running them on boot keeps Render deploys one-step.
await migrate();
createApp().listen(config.port, () => console.log(`api listening on :${config.port}`));
scheduleSignupCleanup(); // reminders / expiry for signups that never filled in the profile
