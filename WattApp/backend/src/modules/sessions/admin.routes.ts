import { packageCharging } from '../packages/charging';
import { publicPackageRun } from '../packages/charging.service';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { validateBody } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/requireRole';
import { callFn, query } from '../../db/pool';

// Admin oversight of live charging sessions. Mounted alongside the main admin
// router at /api/admin, kept in this module so it lives with sessions.routes.ts.
//
// 🔴 MONEY-CRITICAL. force-stop calls admin_force_stop_session/
// admin_refund_charging_session, which both wrap the same shared
// _finalize_charging_session used everywhere else. Do NOT reimplement billing here.
const router = Router();
router.use(requireAuth, requireAdmin);

// All currently active sessions platform-wide, for the "stuck session" tool.
router.get('/sessions/active', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `select cs.id, cs.started_at, cs.kwh_delivered, cs.cost, cs.held_amount,
            p.full_name as customer_name, p.phone as customer_phone,
            coalesce(s.name, cl.station_name) as charger_name,
            b.booked_end
       from public.charging_sessions cs
       join public.profiles p on p.id = cs.user_id
       left join public.stations s on s.id = cs.station_id
       left join public.charger_listings cl on cl.id = cs.listing_id
       left join public.bookings b on b.id = cs.booking_id
      where cs.status = 'active'
      order by cs.started_at asc`,
  );
  res.json(rows);
}));

// Force-stop a stuck session: 'bill' finalizes normally (same as auto-shutoff),
// 'refund' releases the hold with no charge.
router.post('/sessions/:id/force-stop',
  validateBody(z.object({
    mode: z.enum(['bill', 'refund']),
    reason: z.string().trim().max(500).optional(),
  })),
  asyncHandler(async (req, res) => {
    const { rows: packageRuns } = await query('select id from package_charging_runs where id=$1', [req.params.id]);
    if (packageRuns.length) {
      const run = await packageCharging.stop(req.params.id, req.user!.id, true, 'administrator');
      res.json({ ...publicPackageRun(run), refund_requires_review: req.body.mode === 'refund' });
      return;
    }
    const fn = req.body.mode === 'refund' ? 'admin_refund_charging_session' : 'admin_force_stop_session';
    const row = await callFn<{ result: any }>(
      req.user!.id,
      `select public.${fn}($1,$2) as result`,
      [req.params.id, req.body.reason ?? null],
    );
    res.json(row.result);
  }),
);

export default router;
