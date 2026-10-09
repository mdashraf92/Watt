import { Router, Request } from 'express';
import { randomBytes, createHash } from 'crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { pool } from '../../db/pool';
import { asyncHandler } from '../../middleware/error';
import { verifyPassword } from '../../lib/password';
import { badRequest, forbidden, unauthorized } from '../../lib/errors';
import { transaction } from '../marketplace/marketplace.service';
import marketplaceRoutes from '../marketplace/marketplace.routes';
import notificationsRoutes from '../notifications/notifications.routes';

// Web seller portal API (/seller/ in the browser). Shop and service-provider
// owners sign in with their normal Go Watt account; the portal then uses the
// same marketplace endpoints as the app, under /api/seller/marketplace/*.
// Modelled on the admin dashboard: httpOnly SameSite=strict cookie, hashed
// token in seller_sessions, same-origin check on writes, rate-limited login.
// Separate cookie + table + path, so it can never reach /api/dashboard.
const router = Router();
const cookieName = 'gowatt_seller';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const token = (req: Request) => req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='))?.slice(cookieName.length + 1) || '';
const cookieOptions = (req: Request) => ({ httpOnly: true, secure: req.secure, sameSite: 'strict' as const, path: '/api/seller' });
const query = (sql: string, params: unknown[] = []) => pool.query(sql, params).then(r => r.rows);

router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    if (!origin || origin !== `${req.protocol}://${req.get('host')}`) return next(forbidden('Seller portal requests must come from the same origin'));
  }
  next();
});

router.post('/login', rateLimit({ windowMs: 15 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false }), asyncHandler(async (req, res) => {
  const r = z.object({ email: z.string().email(), password: z.string().min(1).max(200) }).safeParse(req.body);
  if (!r.success) throw badRequest('Enter your email and password');
  const u = (await query(
    `select p.id, p.full_name, p.is_active, u.encrypted_password from auth.users u join profiles p on p.id = u.id where lower(u.email) = lower($1)`,
    [r.data.email.trim()],
  ))[0];
  if (!u || !u.is_active || !u.encrypted_password || !(await verifyPassword(u.encrypted_password, r.data.password)))
    throw unauthorized('Incorrect email or password');
  const value = randomBytes(32).toString('hex');
  await transaction(async c => {
    if (token(req)) await c.query('delete from seller_sessions where token_hash = $1', [digest(token(req))]);
    await c.query('delete from seller_sessions where expires_at < now()');
    await c.query(`insert into seller_sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '12 hours')`, [digest(value), u.id]);
  });
  res.cookie(cookieName, value, { ...cookieOptions(req), maxAge: 12 * 60 * 60 * 1000 });
  res.json({ id: u.id, name: u.full_name });
}));

router.use(asyncHandler(async (req, res, next) => {
  const value = token(req);
  if (!/^[a-f0-9]{64}$/.test(value)) throw unauthorized('Sign in to the seller portal');
  const u = (await query(
    `select p.id, p.full_name, p.role, p.is_active from seller_sessions s join profiles p on p.id = s.user_id where s.token_hash = $1 and s.expires_at > now()`,
    [digest(value)],
  ))[0];
  if (!u || !u.is_active) { res.clearCookie(cookieName, cookieOptions(req)); throw unauthorized('Your session ended. Please sign in again.'); }
  req.user = { id: u.id, role: u.role };
  res.locals.sellerUser = u;
  next();
}));

router.get('/session', (req, res) => res.json({ id: req.user!.id, name: res.locals.sellerUser.full_name }));
router.post('/logout', asyncHandler(async (req, res) => {
  await query('delete from seller_sessions where token_hash = $1', [digest(token(req))]);
  res.clearCookie(cookieName, cookieOptions(req));
  res.json({ ok: true });
}));
router.use('/marketplace', marketplaceRoutes);
// Same inbox as the app (/api/notifications), for the signed-in dashboard user.
router.use('/notifications', notificationsRoutes);

export default router;
