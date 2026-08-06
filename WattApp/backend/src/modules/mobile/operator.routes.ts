import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../middleware/error';
import { validateBody } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { callFn, query } from '../../db/pool';
import { badRequest, notFound } from '../../lib/errors';
import { notify } from '../../integrations/notify';
import { emitToUser, emitToJob } from '../../realtime/socket';
import { runDispatch } from './dispatch';

// The driver's half of mobile charging: one van, one job at a time, a short
// list of buttons. Admins are allowed in too so support can unstick a job when
// a driver's phone dies mid-delivery.
const router = Router();
router.use(requireAuth, requireRole('operator', 'admin', 'superadmin'));

async function myVan(userId: string) {
  const { rows } = await query(
    `select * from public.service_vans where operator_id = $1`, [userId],
  );
  return rows[0] ?? null;
}

// Van, duty state, and the job in hand (if any).
router.get('/me', asyncHandler(async (req, res) => {
  const van = await myVan(req.user!.id);
  const { rows: jobs } = await query(
    `select r.*, p.full_name as customer_name, p.phone as customer_phone
       from public.mobile_charge_requests r
       join public.profiles p on p.id = r.user_id
      where r.operator_id = $1
        and r.status in ('assigned','en_route','arrived','charging')
      order by r.created_at limit 1`,
    [req.user!.id],
  );
  res.json({ van, active_job: jobs[0] ?? null });
}));

// On/off duty. Going off duty while holding a job would strand the customer,
// so it is refused — finish or hand it back first.
router.post('/duty',
  validateBody(z.object({
    on_duty: z.boolean(),
    latitude:  z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })),
  asyncHandler(async (req, res) => {
    const van = await myVan(req.user!.id);
    if (!van) throw badRequest('NO_VAN|No van is assigned to you');

    const { rows: live } = await query(
      `select 1 from public.mobile_charge_requests
        where operator_id = $1 and status in ('assigned','en_route','arrived','charging')`,
      [req.user!.id],
    );
    if (!req.body.on_duty && live.length) {
      throw badRequest('BUSY|Finish your current job before going off duty');
    }

    const { rows } = await query(
      `update public.service_vans
          set status = case when $2 then 'available' else 'offline' end,
              last_lat = coalesce($3, last_lat),
              last_lng = coalesce($4, last_lng),
              last_seen_at = now()
        where id = $1 returning *`,
      [van.id, req.body.on_duty, req.body.latitude ?? null, req.body.longitude ?? null],
    );
    // A van coming on duty may be the one a waiting customer needs.
    if (req.body.on_duty) runDispatch().catch(() => {});
    res.json(rows[0]);
  }),
);

// GPS heartbeat while on duty. Its own limiter: the app sends this every ~15 s,
// which would eat most of a shared budget meant for ordinary requests.
const heartbeat = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });

router.post('/location',
  heartbeat,
  validateBody(z.object({
    latitude:  z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })),
  asyncHandler(async (req, res) => {
    const van = await myVan(req.user!.id);
    if (!van) throw badRequest('NO_VAN|No van is assigned to you');

    // Only the last fix is kept — no location history for a named employee.
    await query(
      `update public.service_vans set last_lat = $2, last_lng = $3, last_seen_at = now()
        where id = $1`,
      [van.id, req.body.latitude, req.body.longitude],
    );

    // Push the position to the job room only, so exactly one customer — the one
    // waiting for this van — can see where it is.
    const { rows } = await query(
      `select id from public.mobile_charge_requests
        where operator_id = $1 and status in ('assigned','en_route','arrived','charging')
        limit 1`,
      [req.user!.id],
    );
    if (rows[0]) {
      emitToJob(rows[0].id, 'van_location', {
        request_id: rows[0].id,
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        at: new Date().toISOString(),
      });
    }
    res.status(204).end();
  }),
);

// The offer currently on the table, plus recent history for the driver's own record.
router.get('/jobs', asyncHandler(async (req, res) => {
  const van = await myVan(req.user!.id);
  const { rows: offered } = van ? await query(
    `select r.id, r.pickup_lat, r.pickup_lng, r.address_text, r.notes,
            r.requested_kwh, r.car_make, r.car_model, r.connector_type,
            r.offer_expires_at,
            public.haversine_km($2, $3, r.pickup_lat, r.pickup_lng) as distance_km
       from public.mobile_charge_requests r
      where r.status = 'offered' and r.offered_van_id = $1 and r.offer_expires_at > now()`,
    [van.id, van.last_lat, van.last_lng],
  ) : { rows: [] as any[] };

  const { rows: history } = await query(
    `select r.*, p.full_name as customer_name
       from public.mobile_charge_requests r
       join public.profiles p on p.id = r.user_id
      where r.operator_id = $1 and r.status in ('completed','cancelled')
      order by r.created_at desc limit 30`,
    [req.user!.id],
  );

  res.json({ offered: offered[0] ?? null, history });
}));

router.post('/jobs/:id/accept', asyncHandler(async (req, res) => {
  const row = await callFn<{ result: any }>(
    req.user!.id,
    'select public.accept_mobile_charge($1) as result',
    [req.params.id],
  );
  const result = row.result;
  if (!result?.taken && result?.user_id) {
    emitToUser(result.user_id, 'mobile_job_update', { request_id: req.params.id, status: 'assigned' });
    await notify({
      userIds: [result.user_id],
      category: 'charging',
      kind: 'mobile_assigned',
      title: 'A van is on the way',
      body: 'A driver accepted your request and is heading to you.',
      data: { request_id: req.params.id },
      dedupeKey: `mobile_assigned:${req.params.id}`,
    }).catch(() => {});
  }
  res.json(result);
}));

router.post('/jobs/:id/decline', asyncHandler(async (req, res) => {
  const row = await callFn<{ result: any }>(
    req.user!.id,
    'select public.decline_mobile_charge($1) as result',
    [req.params.id],
  );
  // Straight back on the board for the next-nearest van.
  runDispatch().catch(() => {});
  res.json(row.result);
}));

const CUSTOMER_COPY: Record<string, { title: string; body: string }> = {
  en_route: { title: 'Your driver is on the way', body: 'The van has set off towards you.' },
  arrived:  { title: 'Your driver has arrived',   body: 'The van is at your location.' },
  charging: { title: 'Charging started',          body: 'Your car is now charging.' },
};

router.post('/jobs/:id/status',
  validateBody(z.object({
    status:    z.enum(['en_route', 'arrived', 'charging']),
    latitude:  z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    eta_minutes: z.number().int().min(0).max(240).optional(),
  })),
  asyncHandler(async (req, res) => {
    const { status, latitude, longitude, eta_minutes } = req.body;
    const row = await callFn<{ result: any }>(
      req.user!.id,
      'select public.set_mobile_charge_status($1,$2,$3,$4,$5) as result',
      [req.params.id, status, latitude ?? null, longitude ?? null, eta_minutes ?? null],
    );
    const result = row.result;
    emitToJob(req.params.id, 'mobile_job_update', { request_id: req.params.id, status });
    if (result?.user_id && CUSTOMER_COPY[status]) {
      await notify({
        userIds: [result.user_id],
        category: 'charging',
        kind: `mobile_${status}`,
        title: CUSTOMER_COPY[status].title,
        body:  CUSTOMER_COPY[status].body,
        data: { request_id: req.params.id },
        dedupeKey: `mobile_${status}:${req.params.id}`,
      }).catch(() => {});
    }
    res.json(result);
  }),
);

// Deliver and bill. Capped at the ordered kWh and at the hold inside the SQL
// function, so a mistyped meter reading cannot overcharge anyone.
router.post('/jobs/:id/complete',
  validateBody(z.object({
    kwh:         z.number().nonnegative(),
    battery_end: z.number().int().min(0).max(100).nullable().optional(),
    meter_kwh:   z.number().nonnegative().nullable().optional(),
  })),
  asyncHandler(async (req, res) => {
    const { kwh, battery_end, meter_kwh } = req.body;
    const row = await callFn<{ result: any }>(
      req.user!.id,
      'select public.complete_mobile_charge($1,$2,$3,$4) as result',
      [req.params.id, kwh, battery_end ?? null, meter_kwh ?? null],
    );
    const result = row.result;
    emitToJob(req.params.id, 'mobile_job_update', { request_id: req.params.id, status: 'completed' });
    if (!result?.already && result?.user_id) {
      await notify({
        userIds: [result.user_id],
        category: 'charging',
        kind: 'mobile_completed',
        title: 'Charging finished',
        body: `${Number(result.kwh).toFixed(1)} kWh delivered. Charged ${Number(result.cost).toFixed(3)} OMR.`,
        data: { request_id: req.params.id },
        dedupeKey: `mobile_completed:${req.params.id}`,
      }).catch(() => {});
    }
    res.json(result);
  }),
);

// Detail for the driver's job screen — includes the customer's number, because
// "I can't find you" is the most common thing that goes wrong on a callout.
router.get('/jobs/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select r.*, p.full_name as customer_name, p.phone as customer_phone
       from public.mobile_charge_requests r
       join public.profiles p on p.id = r.user_id
      where r.id = $1 and (r.operator_id = $2 or r.offered_van_id in (
              select id from public.service_vans where operator_id = $2))`,
    [req.params.id, req.user!.id],
  );
  if (!rows[0]) throw notFound('Job not found');
  res.json(rows[0]);
}));

export default router;
