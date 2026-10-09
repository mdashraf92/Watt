import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validateBody } from '../../middleware/validate';
import { query, callFn, pool } from '../../db/pool';
import { AppError } from '../../lib/errors';
import * as tuya from '../../integrations/tuya';

const router = Router();
const requireHost = requireRole('host', 'investor');

router.get('/summary',requireAuth,requireHost,asyncHandler(async(req,res)=>{
 const user=req.user!.id;
 const [earnings,sessions,payouts]=await Promise.all([
  query(`select coalesce(sum(amount) filter(where created_at >= (date_trunc('day',now() at time zone 'Asia/Muscat') at time zone 'Asia/Muscat')),0) as today,
   coalesce(sum(amount) filter(where created_at >= (date_trunc('month',now() at time zone 'Asia/Muscat') at time zone 'Asia/Muscat')),0) as month
   from wallet_transactions where user_id=$1 and type='earning'`,[user]),
  query(`select s.id,s.status,s.started_at,s.kwh_delivered,s.cost from charging_sessions s join charger_listings l on l.id=s.listing_id where l.host_id=$1 and s.status='active' order by s.started_at limit 10`,[user]),
  query(`select coalesce(sum(amount),0) as pending from payout_requests where user_id=$1 and status::text='pending'`,[user]),
 ]);
 const count=await query(`select count(*)::int as count from charging_sessions s join charger_listings l on l.id=s.listing_id where l.host_id=$1 and s.started_at >= (date_trunc('month',now() at time zone 'Asia/Muscat') at time zone 'Asia/Muscat')`,[user]);
 res.json({earnings:earnings.rows[0],active_sessions:sessions.rows,month_sessions:count.rows[0].count,pending_payout:payouts.rows[0].pending});
}));

// The host's own charger listing.
router.get('/listing', requireAuth, requireHost, asyncHandler(async (req, res) => {
  const { rows } = await query(`select * from public.charger_listings where host_id = $1`, [req.user!.id]);
  res.json(rows[0] ?? null);
}));

// Create the host's listing from their approved application (once).
router.post('/listing', requireAuth, requireHost, asyncHandler(async (req, res) => {
  const existing = await query(`select id from public.charger_listings where host_id = $1`, [req.user!.id]);
  if (existing.rows[0]) return res.json(existing.rows[0]);

  const { rows: apps } = await query(
    `select * from public.charger_applications
     where user_id = $1 and status = 'approved' order by created_at desc limit 1`,
    [req.user!.id],
  );
  const app: any = apps[0] ?? {};
  const { rows: cfg } = await query(`select value from public.app_config where key = 'default_price_per_kwh'`);
  const price = Number(cfg[0]?.value ?? 0.028);

  const { rows } = await query(
    `insert into public.charger_listings
       (host_id, station_name, address, latitude, longitude, charger_type, power_kw, price_per_kwh, is_available)
     values ($1,$2,$3,$4,$5,$6,$7,$8,false) returning *`,
    [req.user!.id, app.station_name ?? null,
     app.city && app.governorate ? `${app.city}, ${app.governorate}` : (app.address ?? ''),
     app.latitude ?? 23.588, app.longitude ?? 58.383,
     app.charger_type ?? 'Type2', app.power_kw ?? 7.4, price],
  );
  res.status(201).json(rows[0]);
}));

// Self-charge: host charges their own car (no booking). Turns on the switch and
// creates an active session, then the app opens the charging screen.
router.post('/self-charge', requireAuth, requireHost, asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select id, tuya_device_id, tuya_verified from public.charger_listings where host_id = $1`,
    [req.user!.id],
  );
  const l = rows[0];
  if (!l) throw new AppError(404, 'not_found', 'No listing');
  if (!l.tuya_device_id) throw new AppError(400, 'no_device', 'No device linked');
  if (!l.tuya_verified) throw new AppError(400, 'not_verified', 'Charger not verified by admin');
  if (tuya.tuyaConfigured()) {
    await tuya.setSwitch(l.tuya_device_id, true);
    await pool.query(`update public.charger_listings set switch_status = true where id = $1`, [l.id]);
  }
  const { rows: s } = await query(
    `insert into public.charging_sessions (user_id, listing_id, status, battery_start_pct, held_amount)
     values ($1,$2,'active',20,0) returning id`,
    [req.user!.id, l.id],
  );
  res.status(201).json({ session_id: s[0].id });
}));

// Bookings on the host's charger (function returns customer name/phone safely).
router.get('/bookings', requireAuth, requireHost, asyncHandler(async (req, res) => {
  const row = await callFn<{ result: any }>(req.user!.id,
    `select coalesce(json_agg(b), '[]'::json) as result from public.get_host_listing_bookings() b`);
  res.json(row.result);
}));

// Toggle listing availability (a pure flag — never powers the plug; scoped to owner).
router.patch('/listing/availability',
  requireAuth, requireHost,
  validateBody(z.object({ is_available: z.boolean() })),
  asyncHandler(async (req, res) => {
    // Can't go offline while a customer is mid-charge on this charger.
    if (!req.body.is_available) {
      const { rows: lst } = await query(`select id from public.charger_listings where host_id = $1`, [req.user!.id]);
      if (lst[0]) {
        const busy = await callFn<{ result: boolean }>(req.user!.id,
          'select public.listing_has_active_session($1) as result', [lst[0].id]);
        if (busy.result) throw new AppError(409, 'busy', 'A customer is charging right now');
      }
    }
    const { rows } = await query(
      `update public.charger_listings set is_available = $2 where host_id = $1 returning id, is_available`,
      [req.user!.id, req.body.is_available],
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'not_found', message: 'No listing' } });
    res.json(rows[0]);
  }),
);

// Edit listing details the host is allowed to change (price is admin-controlled;
// device id locks after verification — enforced by DB triggers + this allowlist).
router.patch('/listing',
  requireAuth, requireHost,
  validateBody(z.object({
    address: z.string().optional(),
    power_kw: z.number().positive().optional(),
    availability_start: z.string().optional(),
    availability_end: z.string().optional(),
    description: z.string().nullable().optional(),
    tuya_device_id: z.string().nullable().optional(),
  }).strict()),
  asyncHandler(async (req, res) => {
    const body = { ...req.body };
    // Device-ID lock (Phase 3): once the charger is admin-verified, the host may
    // NOT change tuya_device_id. Enforced here since the DB trigger doesn't fire
    // for the backend's connection role.
    if ('tuya_device_id' in body) {
      const { rows } = await query(
        `select tuya_verified from public.charger_listings where host_id = $1`, [req.user!.id]);
      if (rows[0]?.tuya_verified) delete body.tuya_device_id;   // silently keep locked value
    }
    const keys = Object.keys(body);
    if (!keys.length) return res.status(400).json({ error: { code: 'bad_request', message: 'No changeable fields' } });
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const vals = keys.map(k => (body as any)[k]);
    const { rows } = await query(
      `update public.charger_listings set ${sets} where host_id = $1 returning *`, [req.user!.id, ...vals]);
    res.json(rows[0]);
  }),
);

export default router;
