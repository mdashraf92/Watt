import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { query, withUser } from '../../db/pool';
import { AppError, badRequest, notFound } from '../../lib/errors';
import { osrmRoute } from './osrm';
import { findCorridorChargers, planTrip, type PlanParams } from './planner';

// In-app driving directions and the trip planner.
//
// The app draws routes itself on the Leaflet map instead of handing the user
// off to Google Maps. Road geometry comes from OSRM, proxied through here
// rather than called from the device, so that:
//   - the OSRM host stays private and swappable without an app release
//   - requests are authenticated, so the routing box is not open to the world
//   - one place to add caching later if it gets hot
//
// Set OSRM_URL to your self-hosted instance (see docs/SELF_HOSTING.md).
const router = Router();
router.use(requireAuth);

const coord = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

router.post('/route',
  validateBody(z.object({ from: coord, to: coord })),
  asyncHandler(async (req, res) => {
    const { from, to } = req.body;
    const route = await osrmRoute([from, to]);
    res.json({ success: true, ...route });
  }),
);

// ── Trip planner ───────────────────────────────────────────────────────────

async function planDefaults() {
  const { rows } = await query(
    `select key, value from public.app_config where key like 'trip\\_%'`,
  );
  const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    corridorKm:  Number(cfg.trip_corridor_km ?? 5),
    consumption: Number(cfg.trip_consumption_kwh_per_100km ?? 18),
    reserve:     Number(cfg.trip_reserve_soc_pct ?? 15),
  };
}

const planBody = z.object({
  from: coord,
  to: coord,
  waypoints: z.array(coord).max(5).optional(),
  battery_kwh: z.number().positive().max(500),
  start_soc_pct: z.number().min(0).max(100),
  reserve_soc_pct: z.number().min(0).max(50).optional(),
  consumption_kwh_per_100km: z.number().positive().max(100).optional(),
  connector_type: z.string().max(20).nullable().optional(),
});

// Plan a journey: road route, chargers along it, and where you must stop.
// Stateless — nothing is saved unless the driver asks for it via POST /trips.
router.post('/plan',
  validateBody(planBody),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof planBody>;
    const d = await planDefaults();

    const route = await osrmRoute([b.from, ...(b.waypoints ?? []), b.to]);
    const candidates = await findCorridorChargers(route, d.corridorKm, b.connector_type);

    const params: PlanParams = {
      battery_kwh: b.battery_kwh,
      start_soc_pct: b.start_soc_pct,
      reserve_soc_pct: b.reserve_soc_pct ?? d.reserve,
      consumption_kwh_per_100km: b.consumption_kwh_per_100km ?? d.consumption,
      connector_type: b.connector_type ?? null,
    };

    const plan = planTrip(route, candidates, params);
    res.json({
      success: true,
      ...plan,
      coordinates: route.coordinates,
      // Everything in the corridor, not just the chosen stops — the app shows
      // these as optional alternatives the driver can swap in.
      nearby: candidates,
      params,
    });
  }),
);

// ── Saved trips ────────────────────────────────────────────────────────────

router.get('/trips', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select t.*,
            (select count(*)::int from public.trip_stops s where s.trip_id = t.id) as stop_count
       from public.trips t
      where t.user_id = $1 and t.status <> 'cancelled'
      order by t.created_at desc limit 30`,
    [req.user!.id],
  );
  res.json(rows);
}));

router.get('/trips/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select * from public.trips where id = $1 and user_id = $2`,
    [req.params.id, req.user!.id],
  );
  if (!rows[0]) throw notFound('Trip not found');
  const { rows: stops } = await query(
    `select s.*, b.status as booking_status, b.booked_at
       from public.trip_stops s
       left join public.bookings b on b.id = s.booking_id
      where s.trip_id = $1 order by s.seq`,
    [req.params.id],
  );
  res.json({ ...rows[0], stops });
}));

const saveBody = z.object({
  name: z.string().max(80).optional(),
  from: coord.extend({ label: z.string().max(200).optional() }),
  to:   coord.extend({ label: z.string().max(200).optional() }),
  params: z.record(z.any()),
  plan: z.record(z.any()),
});

// Save a plan the driver has already been shown. The stops are written as rows
// so they can each carry a booking later.
router.post('/trips',
  validateBody(saveBody),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof saveBody>;
    const stops = Array.isArray((b.plan as any)?.stops) ? (b.plan as any).stops : [];

    // One transaction for the trip and all its stops. A charger can be
    // decommissioned between planning and saving, which fails the stop's
    // foreign key — without this the trip row would survive with no stops and
    // the customer would open a saved journey that had silently lost its plan.
    const trip = await withUser(req.user!.id, async (client) => {
      const { rows } = await client.query(
        `insert into public.trips
           (user_id, name, from_lat, from_lng, from_label, to_lat, to_lng, to_label, params, plan)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb) returning *`,
        [
          req.user!.id, b.name ?? '',
          b.from.latitude, b.from.longitude, b.from.label ?? '',
          b.to.latitude, b.to.longitude, b.to.label ?? '',
          JSON.stringify(b.params), JSON.stringify(b.plan),
        ],
      );
      const created = rows[0];

      for (let i = 0; i < stops.length; i++) {
        const s = stops[i];
        await client.query(
          `insert into public.trip_stops
             (trip_id, seq, station_id, listing_id, name, latitude, longitude,
              along_km, arrive_soc, depart_soc, charge_kwh, charge_minutes, cost)
           values ($1,$2,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            created.id, i,
            s.kind === 'station' ? s.id : null,
            s.kind === 'listing' ? s.id : null,
            s.name ?? '', s.latitude, s.longitude,
            s.along_km ?? 0, s.arrive_soc_pct ?? null, s.depart_soc_pct ?? null,
            s.charge_kwh ?? null, s.charge_minutes ?? null, s.cost ?? null,
          ],
        );
      }
      return created;
    });

    res.json({ ...trip, stop_count: stops.length });
  }),
);

router.delete('/trips/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `delete from public.trips where id = $1 and user_id = $2 returning id`,
    [req.params.id, req.user!.id],
  );
  if (!rows[0]) throw notFound('Trip not found');
  res.status(204).end();
}));

// Attach a booking the app has already created to a stop.
//
// Only the next unbooked stop may be linked, on purpose. Reserving a connector
// three hundred kilometres ahead depends on an ETA that will drift, and a
// missed reservation costs the customer a no-show penalty
// (release_no_show_bookings). Book as you go.
router.post('/trips/:id/stops/:seq/booking',
  validateBody(z.object({ booking_id: z.string().uuid() })),
  asyncHandler(async (req, res) => {
    const seq = Number(req.params.seq);
    if (!Number.isInteger(seq) || seq < 0) throw badRequest('Bad stop number');

    const { rows: owned } = await query(
      `select 1 from public.trips where id = $1 and user_id = $2`,
      [req.params.id, req.user!.id],
    );
    if (!owned.length) throw notFound('Trip not found');

    const { rows: pending } = await query(
      `select seq from public.trip_stops
        where trip_id = $1 and status = 'planned'
        order by seq limit 1`,
      [req.params.id],
    );
    if (!pending.length || pending[0].seq !== seq) {
      throw new AppError(409, 'conflict', 'NOT_NEXT_STOP|Book stops in order, as you reach them');
    }

    // The booking must belong to the same customer — otherwise a guessed id
    // could be attached to someone else's reservation.
    const { rows: bk } = await query(
      `select id from public.bookings where id = $1 and user_id = $2`,
      [req.body.booking_id, req.user!.id],
    );
    if (!bk.length) throw notFound('Booking not found');

    const { rows } = await query(
      `update public.trip_stops set booking_id = $3, status = 'booked'
        where trip_id = $1 and seq = $2 returning *`,
      [req.params.id, seq, req.body.booking_id],
    );
    await query(`update public.trips set status = 'active' where id = $1 and status = 'planned'`,
      [req.params.id]);
    res.json(rows[0]);
  }),
);

// Mark a stop reached (or deliberately passed), so "the next stop" advances.
router.post('/trips/:id/stops/:seq/:action',
  asyncHandler(async (req, res) => {
    const seq = Number(req.params.seq);
    const action = req.params.action;
    if (!['done', 'skipped'].includes(action)) throw badRequest('Unknown action');

    const { rows } = await query(
      `update public.trip_stops s set status = $3
         from public.trips t
        where s.trip_id = t.id and t.id = $1 and t.user_id = $4 and s.seq = $2
        returning s.*`,
      [req.params.id, seq, action, req.user!.id],
    );
    if (!rows[0]) throw notFound('Stop not found');

    // Last stop dealt with → the trip is over.
    const { rows: left } = await query(
      `select 1 from public.trip_stops where trip_id = $1 and status in ('planned','booked')`,
      [req.params.id],
    );
    if (!left.length) {
      await query(`update public.trips set status = 'completed' where id = $1`, [req.params.id]);
    }
    res.json(rows[0]);
  }),
);

export default router;
