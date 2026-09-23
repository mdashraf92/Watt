import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { validateBody } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { callFn, query } from '../../db/pool';
import { notFound } from '../../lib/errors';
import { notify } from '../../integrations/notify';
import { emitToUser, emitToJob } from '../../realtime/socket';
import { runDispatch } from './dispatch';

// 🔴 MONEY-CRITICAL. Customer side of mobile charging. Every state change goes
// through the SQL functions in sql/backend-mobile-charging.sql, which own the
// wallet hold, the settlement and the audit trail. Nothing here recomputes a
// price or touches a balance.
const router = Router();
router.use(requireAuth);

// What the request screen needs to render before the user commits to anything:
// the price, the allowed order size, and whether there is any point asking.
router.get('/config', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `select key, value from public.app_config where key like 'mobile\\_%'`,
  );
  const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const { rows: vans } = await query(
    `select count(*)::int as on_duty from public.service_vans
      where is_active and status in ('available', 'on_job')`,
  );
  res.json({
    enabled:          String(cfg.mobile_enabled).toLowerCase() === 'true',
    callout_fee:      Number(cfg.mobile_callout_fee ?? 5),
    price_per_kwh:    Number(cfg.mobile_price_per_kwh ?? 0.12),
    min_kwh:          Number(cfg.mobile_min_kwh ?? 5),
    max_kwh:          Number(cfg.mobile_max_kwh ?? 30),
    hold_buffer:      Number(cfg.mobile_hold_buffer ?? 1.15),
    cancel_fee:       Number(cfg.mobile_cancel_fee ?? 0),
    service_radius_km: Number(cfg.mobile_service_radius_km ?? 60),
    vans_on_duty:     vans[0]?.on_duty ?? 0,
  });
}));

// Shared shape for the tracking screen: the request plus who is driving to you.
// The driver's phone is exposed only while the job is live — once it is over,
// the customer has no continuing reason to hold a colleague's number.
const REQUEST_SELECT = `
  select r.*,
         case when r.status in ('assigned','en_route','arrived','charging')
              then json_build_object(
                     'name',  op.full_name,
                     'phone', op.phone,
                     'van',   v.label,
                     'plate', v.plate,
                     'lat',   v.last_lat,
                     'lng',   v.last_lng,
                     'seen_at', v.last_seen_at)
              else null end as driver
    from public.mobile_charge_requests r
    left join public.service_vans v on v.id = r.van_id
    left join public.profiles op    on op.id = r.operator_id`;

router.get('/requests', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `${REQUEST_SELECT} where r.user_id = $1 order by r.created_at desc limit 30`,
    [req.user!.id],
  );
  res.json(rows);
}));

// Declared before '/:id' so 'active' is not swallowed as an id.
router.get('/requests/active', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `${REQUEST_SELECT}
      where r.user_id = $1
        and r.status in ('pending','offered','assigned','en_route','arrived','charging')
      order by r.created_at desc limit 1`,
    [req.user!.id],
  );
  res.json(rows[0] ?? null);
}));

router.get('/requests/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `${REQUEST_SELECT} where r.id = $1 and r.user_id = $2`,
    [req.params.id, req.user!.id],
  );
  if (!rows[0]) throw notFound('Request not found');
  res.json(rows[0]);
}));

// Place the hold and put the job on the board.
router.post('/requests',
  validateBody(z.object({
    latitude:  z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    kwh:       z.number().positive(),
    notes:     z.string().max(500).optional(),
    address:   z.string().max(300).optional(),
  })),
  asyncHandler(async (req, res) => {
    const { latitude, longitude, kwh, notes, address } = req.body;
    const row = await callFn<{ result: any }>(
      req.user!.id,
      'select public.request_mobile_charge($1,$2,$3,$4,$5) as result',
      [latitude, longitude, kwh, notes ?? null, address ?? null],
    );
    // Offer it to the nearest van now rather than on the next cron tick — a
    // minute is a long time when someone is stopped on the hard shoulder.
    runDispatch().catch(() => {});
    res.json(row.result);
  }),
);

router.post('/requests/:id/cancel',
  validateBody(z.object({ reason: z.string().max(300).optional() })),
  asyncHandler(async (req, res) => {
    const row = await callFn<{ result: any }>(
      req.user!.id,
      'select public.cancel_mobile_charge($1,$2) as result',
      [req.params.id, req.body.reason ?? null],
    );
    const result = row.result;
    if (!result?.already && result?.operator_id) {
      emitToUser(result.operator_id, 'mobile_job_update', {
        request_id: req.params.id, status: 'cancelled',
      });
      await notify({
        userIds: [result.operator_id],
        category: 'charging',
        kind: 'mobile_cancelled',
        title: 'Job cancelled',
        body: 'The customer cancelled this mobile charge.',
        data: { request_id: req.params.id },
        dedupeKey: `mobile_cancelled:${req.params.id}`,
      }).catch(() => {});
    }
    emitToJob(req.params.id, 'mobile_job_update', { request_id: req.params.id, status: 'cancelled' });
    res.json(result);
  }),
);

router.post('/requests/:id/rate',
  validateBody(z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(500).optional() })),
  asyncHandler(async (req, res) => {
    const row = await callFn<{ result: any }>(
      req.user!.id,
      'select public.rate_mobile_charge($1,$2,$3) as result',
      [req.params.id, req.body.rating, req.body.comment ?? null],
    );
    res.json(row.result);
  }),
);

export default router;
