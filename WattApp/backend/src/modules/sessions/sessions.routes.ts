import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { validateBody } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { callFn, query } from '../../db/pool';

// 🔴 MONEY-CRITICAL. These call the existing hardened SQL functions (with the
// user context set via withUser/callFn), preserving idempotency, row-locking,
// hold/billing correctness, and host payout. Do NOT reimplement this logic here.
const router = Router();

// The current user's charging history (with station name).
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select cs.*, json_build_object('name', s.name) as station
     from public.charging_sessions cs
     left join public.stations s on s.id = cs.station_id
     where cs.user_id = $1 order by cs.started_at desc limit 30`,
    [req.user!.id],
  );
  res.json(rows);
}));

// The user's currently-active session (for restoring the banner after a restart).
// Must be declared before '/:id' so 'active' isn't captured as an id.
router.get('/active', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select cs.id,
            json_build_object('name', s.name) as station,
            json_build_object('station_name', cl.station_name, 'address', cl.address) as listing
     from public.charging_sessions cs
     left join public.stations s on s.id = cs.station_id
     left join public.charger_listings cl on cl.id = cs.listing_id
     where cs.user_id = $1 and cs.status = 'active'
     order by cs.started_at desc limit 1`,
    [req.user!.id],
  );
  res.json(rows[0] ?? null);
}));

// Single session (owner only) with station/listing/booking for the charging screen.
// `booked_end` + the overstay settings are included so the client can render an
// accurate grace/overstay banner without a separate settings call.
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select cs.*,
            row_to_json(s.*) as station,
            json_build_object('id', cl.id, 'tuya_device_id', cl.tuya_device_id, 'power_kw', cl.power_kw,
              'price_per_kwh', cl.price_per_kwh, 'address', cl.address) as listing,
            json_build_object('id', b.id, 'listing_id', b.listing_id, 'booked_end', b.booked_end) as booking,
            (select value::int from app_config where key = 'overstay_grace_minutes') as overstay_grace_minutes,
            (select value::numeric from app_config where key = 'overstay_fee_per_minute') as overstay_fee_per_minute
     from public.charging_sessions cs
     left join public.stations s on s.id = cs.station_id
     left join public.charger_listings cl on cl.id = cs.listing_id
     left join public.bookings b on b.id = cs.booking_id
     where cs.id = $1 and cs.user_id = $2`,
    [req.params.id, req.user!.id],
  );
  if (!rows[0]) return res.status(404).json({ error: { code: 'not_found', message: 'Session not found' } });
  res.json(rows[0]);
}));

// Live progress sync while charging (kwh/cost). Owner's active session only.
router.patch('/:id/progress',
  requireAuth,
  validateBody(z.object({ kwh_delivered: z.number().nonnegative(), cost: z.number().nonnegative() })),
  asyncHandler(async (req, res) => {
    await query(
      `update public.charging_sessions set kwh_delivered = $3, cost = $4
       where id = $1 and user_id = $2 and status = 'active'`,
      [req.params.id, req.user!.id, req.body.kwh_delivered, req.body.cost],
    );
    res.status(204).end();
  }),
);

// Start charging: verifies funds, places the hold, creates the session.
router.post('/start',
  requireAuth,
  validateBody(z.object({ booking_id: z.string().uuid() })),
  asyncHandler(async (req, res) => {
    const row = await callFn<{ result: any }>(
      req.user!.id,
      'select public.start_charging_session($1) as result',
      [req.body.booking_id],
    );
    res.json(row.result);
  }),
);

// Complete charging: bills (capped at the hold), releases hold, pays host,
// reconciles the meter reading.
router.post('/:id/complete',
  requireAuth,
  validateBody(z.object({
    kwh: z.number().nonnegative(),
    battery_end: z.number().int().min(0).max(100).nullable().optional(),
    description: z.string().optional(),
    meter_kwh: z.number().nonnegative().nullable().optional(),
  })),
  asyncHandler(async (req, res) => {
    const { kwh, battery_end, description, meter_kwh } = req.body;
    const row = await callFn<{ result: any }>(
      req.user!.id,
      'select public.complete_charging_session($1,$2,$3,$4,$5) as result',
      [req.params.id, kwh, battery_end ?? null, description ?? null, meter_kwh ?? null],
    );
    res.json(row.result);
  }),
);

// Attach a post-session photo (proof of condition/completion). Not
// money-critical, so a plain owner-scoped update is enough — no SQL function.
router.post('/:id/photo',
  requireAuth,
  validateBody(z.object({ photo_base64: z.string().min(1).max(3_000_000) })),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `update public.charging_sessions
         set completion_photo_base64 = $3, completion_photo_taken_at = now()
       where id = $1 and user_id = $2
       returning id, completion_photo_base64, completion_photo_taken_at`,
      [req.params.id, req.user!.id, req.body.photo_base64],
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'not_found', message: 'Session not found' } });
    res.json(rows[0]);
  }),
);

// Rate a completed session.
router.post('/:id/rate',
  requireAuth,
  validateBody(z.object({ rating: z.number().int().min(1).max(5), comment: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const row = await callFn<{ result: any }>(
      req.user!.id,
      'select public.rate_session($1,$2,$3) as result',
      [req.params.id, req.body.rating, req.body.comment ?? null],
    );
    res.json(row.result);
  }),
);

export default router;
