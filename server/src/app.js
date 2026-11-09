import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { loadUser } from './lib/auth.js';
import { errorHandler, HttpError } from './lib/http.js';
import { useClientIp } from './lib/clientIp.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import meRoutes from './routes/me.js';
import campaignRoutes from './routes/campaigns.js';
import adminRoutes from './routes/admin/index.js';
import imageRoutes from './routes/images.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render's proxy sets the protocol (secure cookies); the visitor IP comes from useClientIp
  app.disable('x-powered-by');
  app.use(useClientIp); // before the rate limiters, which count per req.ip
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  const api = express.Router();
  api.use(loadUser);
  api.use('/auth', authRoutes);
  api.use('/public', publicRoutes);
  api.use('/me', meRoutes);
  api.use('/campaigns', campaignRoutes);
  api.use('/images', imageRoutes);
  api.use('/admin', adminRoutes);
  api.use((_req, _res, next) => next(new HttpError(404, 'not_found')));

  app.use('/api/v1', api);
  app.use(errorHandler);
  return app;
}
