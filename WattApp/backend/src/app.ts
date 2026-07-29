import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { attachUser } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';

import authRoutes from './modules/auth/auth.routes';
import profileRoutes from './modules/profile/profile.routes';
import stationsRoutes from './modules/stations/stations.routes';
import chargersRoutes from './modules/chargers/chargers.routes';
import sessionsRoutes from './modules/sessions/sessions.routes';
import bookingsRoutes from './modules/bookings/bookings.routes';
import walletRoutes from './modules/wallet/wallet.routes';
import favoritesRoutes from './modules/favorites/favorites.routes';
import payoutsRoutes from './modules/payouts/payouts.routes';
import adminRoutes from './modules/admin/admin.routes';
import superadminRoutes from './modules/superadmin/superadmin.routes';
import hostRoutes from './modules/host/host.routes';
import applicationsRoutes from './modules/applications/applications.routes';
import paymentsRoutes from './modules/payments/payments.routes';
import paymentReturnRoutes from './modules/payments/return.routes';
import devicesRoutes from './modules/devices/devices.routes';
import notificationsRoutes from './modules/notifications/notifications.routes';
import jobsRoutes from './modules/jobs/jobs.routes';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','), credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(attachUser);

  app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

  // Stricter rate limit on auth endpoints.
  const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 50, standardHeaders: true, legacyHeaders: false });

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/stations', stationsRoutes);
  app.use('/api/chargers', chargersRoutes);
  app.use('/api/sessions', sessionsRoutes);
  app.use('/api/bookings', bookingsRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/favorites', favoritesRoutes);
  app.use('/api/payouts', payoutsRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/superadmin', superadminRoutes);
  app.use('/api/host', hostRoutes);
  app.use('/api/applications', applicationsRoutes);
  app.use('/api/payments', paymentsRoutes);
  app.use('/pay', paymentReturnRoutes);   // public — payment redirect bounce pages
  app.use('/api/devices', devicesRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/jobs', jobsRoutes);   // cron-only (x-job-secret)

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
