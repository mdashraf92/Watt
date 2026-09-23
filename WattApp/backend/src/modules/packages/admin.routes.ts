import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/requireRole';
import { validateBody } from '../../middleware/validate';
import { callFn, query, withUser } from '../../db/pool';
import { badRequest, conflict, notFound } from '../../lib/errors';

/**
 * Venue packages — admin side. Mounted alongside the main admin router at
 * /api/admin, kept in this module so it lives with packages.routes.ts.
 *
 * Packages are deactivated, never deleted: an entitlement references the
 * package it came from, and the purchase history has to stay readable.
 */
const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/packages/staff-search', asyncHandler(async (req, res) => {
  const phone = z.string().trim().min(5).max(40).safeParse(req.query.phone);
  if (!phone.success) throw badRequest('Enter the exact registered phone number');
  const { rows } = await query('select id, full_name, phone from profiles where phone=$1 order by id limit 10', [phone.data]);
  res.json(rows);
}));

router.get('/packages/venues/:id/operations', asyncHandler(async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) throw badRequest('Invalid venue ID');
  const venue = await query('select id,name,name_ar,is_package_venue from stations where id=$1', [req.params.id]);
  if (!venue.rows.length) throw notFound('Venue not found');
  const [staff, devices, runs] = await Promise.all([
    query(`select p.id,p.full_name,p.phone from venue_staff vs join profiles p on p.id=vs.user_id where vs.station_id=$1 order by p.full_name`, [req.params.id]),
    query(`select c.id as connector_id,c.connector_type,c.power_kw,d.device_id,d.switch_code,d.energy_code,d.energy_scale,coalesce(d.enabled,false) as enabled,
      exists(select 1 from charging_sessions cs where cs.connector_id=c.id and cs.status='active') as busy
      from connectors c left join package_devices d on d.connector_id=c.id where c.station_id=$1 order by c.id`, [req.params.id]),
    query(`select r.id,r.entitlement_id,r.connector_id,r.state,r.stop_reason,r.flagged_review,r.created_at,r.ended_at,
      e.package_name,e.package_name_ar from package_charging_runs r join entitlements e on e.id=r.entitlement_id
      where e.station_id=$1 and (r.flagged_review or r.state<>'completed') order by r.created_at desc limit 100`, [req.params.id]),
  ]);
  res.json({ venue: venue.rows[0], staff: staff.rows, devices: devices.rows, runs: runs.rows });
}));

router.put('/packages/venues/:id', validateBody(z.object({ is_package_venue: z.boolean() })), asyncHandler(async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) throw badRequest('Invalid venue ID');
  await withUser(req.user!.id, async client => {
    const { rows } = await client.query('select is_package_venue from stations where id=$1 for update', [req.params.id]);
    if (!rows.length) throw notFound('Venue not found');
    if (rows[0].is_package_venue === req.body.is_package_venue) return;
    const pending = await client.query(`select 1 from charging_sessions where station_id=$1 and status='active'
      union all select 1 from bookings where station_id=$1 and status in ('pending','confirmed') limit 1`, [req.params.id]);
    if (pending.rows.length) throw conflict('Finish active sessions and resolve pending bookings before changing venue mode');
    await client.query('update stations set is_package_venue=$2 where id=$1', [req.params.id, req.body.is_package_venue]);
  });
  res.status(204).end();
}));

// Staff membership never grants general administrator or customer data access.
router.put('/packages/staff', validateBody(z.object({
  station_id: z.string().uuid(), user_id: z.string().uuid(), enabled: z.boolean(),
})), asyncHandler(async (req, res) => {
  if (req.body.enabled) await query('insert into venue_staff(station_id,user_id) values($1,$2) on conflict do nothing', [req.body.station_id, req.body.user_id]);
  else await query('delete from venue_staff where station_id=$1 and user_id=$2', [req.body.station_id, req.body.user_id]);
  res.status(204).end();
}));

router.put('/packages/devices', validateBody(z.object({
  connector_id: z.string().uuid(), device_id: z.string().trim().min(1).max(100),
  switch_code: z.string().regex(/^[a-zA-Z0-9_]+$/).max(100),
  energy_code: z.string().regex(/^[a-zA-Z0-9_]+$/).max(100),
  energy_scale: z.number().finite().positive().max(1000), enabled: z.boolean(),
})), asyncHandler(async (req, res) => {
  const b = req.body;
  await withUser(req.user!.id, async client => {
    const connector = await client.query('select id from connectors where id=$1 for update', [b.connector_id]);
    if (!connector.rows.length) throw notFound('Connector not found');
    const active = await client.query("select 1 from charging_sessions where connector_id=$1 and status='active'", [b.connector_id]);
    if (active.rows.length) throw badRequest('Stop the active session before changing device configuration');
    // Prevent the private-listing switch endpoint from controlling the same device.
    const legacy = await client.query('select 1 from charger_listings where tuya_device_id=$1', [b.device_id]);
    if (legacy.rows.length) throw badRequest('Device is already managed by a private charger listing');
    await client.query(`insert into package_devices(connector_id,device_id,switch_code,energy_code,energy_scale,enabled)
      values($1,$2,$3,$4,$5,$6) on conflict(connector_id) do update set device_id=excluded.device_id,
      switch_code=excluded.switch_code,energy_code=excluded.energy_code,energy_scale=excluded.energy_scale,enabled=excluded.enabled`,
      [b.connector_id,b.device_id,b.switch_code,b.energy_code,b.energy_scale,b.enabled]);
  });
  res.status(204).end();
}));

// Both languages are required on create — a half-translated catalog is the
// fastest way to look unfinished, and Arabic is the primary locale here.
const packageBody = z.object({
  station_id:         z.string().uuid(),
  name:               z.string().trim().min(1).max(250),
  name_ar:            z.string().trim().min(1).max(250),
  description:        z.string().trim().max(4000).default(''),
  description_ar:     z.string().trim().max(4000).default(''),
  partner_benefit:    z.string().trim().min(1).max(250),
  partner_benefit_ar: z.string().trim().min(1).max(250),
  price:              z.number().finite().min(0).max(9999999.999).multipleOf(0.001),
  included_minutes:   z.number().int().positive().nullable().optional(),
  included_kwh:       z.number().finite().positive().nullable().optional(),
  validity_hours:     z.number().int().positive().default(24),
  sort_order:         z.number().int().default(0),
  is_active:          z.boolean().default(false),
});

/** A package with no cap is an open bar on someone else's electricity bill. */
function assertHasCap(v: { included_minutes?: number | null; included_kwh?: number | null }) {
  if (v.included_minutes == null && v.included_kwh == null) {
    throw badRequest('A package needs a cap: included_minutes, included_kwh, or both.');
  }
}

// Every package, active or not, with its venue.
router.get('/packages', asyncHandler(async (req, res) => {
  const parsed = z.string().uuid().optional().safeParse(req.query.station_id);
  if (!parsed.success) throw badRequest('Invalid station ID');
  const stationId = parsed.data;
  const { rows } = await query(
    `select vp.*, vp.updated_at::text as offer_version, s.name as station_name, s.name_ar as station_name_ar,
            (select count(*) from public.entitlements e where e.package_id = vp.id) as sold_count
       from public.venue_packages vp
       join public.stations s on s.id = vp.station_id
      where ($1::uuid is null or vp.station_id = $1)
      order by s.name, vp.sort_order, vp.price`,
    [stationId ?? null],
  );
  res.json(rows);
}));

router.post('/packages',
  validateBody(packageBody),
  asyncHandler(async (req, res) => {
    assertHasCap(req.body);
    const b = req.body;
    const { rows } = await query(
      `insert into public.venue_packages
         (station_id, name, name_ar, description, description_ar,
          partner_benefit, partner_benefit_ar, price,
          included_minutes, included_kwh, validity_hours, sort_order, is_active)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       returning *`,
      [b.station_id, b.name, b.name_ar, b.description, b.description_ar,
       b.partner_benefit, b.partner_benefit_ar, b.price,
       b.included_minutes ?? null, b.included_kwh ?? null, b.validity_hours, b.sort_order, b.is_active],
    );
    res.status(201).json(rows[0]);
  }),
);

// Partial update. Editing price or name changes only the CURRENT offer —
// entitlements already sold keep their own snapshot, by design.
router.patch('/packages/:id',
  validateBody(packageBody.partial().extend({ is_active: z.boolean().optional(), expected_version: z.string().optional() })),
  asyncHandler(async (req, res) => {
    if (!z.string().uuid().safeParse(req.params.id).success) throw badRequest('Invalid package ID');
    const result = await withUser(req.user!.id, async client => {
      const { rows: existing } = await client.query(
        `select included_minutes, included_kwh, updated_at::text as offer_version from public.venue_packages where id = $1 for update`,
        [req.params.id],
      );
      if (!existing.length) throw notFound('Package not found');
      if (req.body.expected_version && req.body.expected_version !== existing[0].offer_version)
        throw conflict('This offer changed. Reload before editing.');

      // Validate the cap against the merged result, not the patch alone —
      // otherwise clearing the only cap that was set would slip through.
      assertHasCap({
        included_minutes: req.body.included_minutes !== undefined
          ? req.body.included_minutes : existing[0].included_minutes,
        included_kwh: req.body.included_kwh !== undefined
          ? req.body.included_kwh : existing[0].included_kwh,
      });

      // Drop keys the caller did not actually send. Zod can surface an optional
      // key as present-but-undefined, and letting that through would write null
      // over a column the caller never mentioned.
      const fields = Object.keys(req.body).filter(k => k !== 'expected_version' && req.body[k] !== undefined);
      if (!fields.length) throw badRequest('Nothing to update');

      // Keys come from the Zod schema above, so they cannot be attacker-chosen.
      const sets = fields.map((k, i) => `${k} = $${i + 2}`).join(', ');
      const { rows } = await client.query(
        `update public.venue_packages set ${sets}, updated_at = now()
          where id = $1 returning *, updated_at::text as offer_version`,
        [req.params.id, ...fields.map(k => req.body[k])],
      );
      return rows[0];
    });
    res.json(result);
  }),
);

// Deactivate. Existing entitlements stay valid and redeemable — the venue
// agreed to honour what it already sold.
router.delete('/packages/:id', asyncHandler(async (req, res) => {
  await query(
    `update public.venue_packages set is_active = false, updated_at = now() where id = $1`,
    [req.params.id],
  );
  res.status(204).end();
}));

// Sold packages, for support and for the redemption-rate metric that matters
// most in Phase 1: bought but never used is a broken promise, not revenue.
router.get('/entitlements', asyncHandler(async (req, res) => {
  const status = req.query.status as string | undefined;
  const { rows } = await query(
    `select e.*, s.name as station_name,
            u.full_name as customer_name, u.phone as customer_phone
       from public.entitlements e
       join public.venue_packages p on p.id = e.package_id
       join public.stations s on s.id = e.station_id
       join public.profiles u on u.id = e.user_id
      where ($1::text is null or e.status = $1)
      order by e.purchased_at desc
      limit 500`,
    [status ?? null],
  );
  res.json(rows);
}));

// Look up by the code the driver shows at the counter.
router.get('/entitlements/by-code/:code', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select e.*, e.package_name as name, e.package_name_ar as name_ar,
            s.name as station_name, u.full_name as customer_name
       from public.entitlements e
       join public.venue_packages p on p.id = e.package_id
       join public.stations s on s.id = e.station_id
       join public.profiles u on u.id = e.user_id
      where e.redeem_code = $1`,
    [req.params.code],
  );
  if (!rows[0]) throw notFound('No such code');
  res.json(rows[0]);
}));

// Refund an unused package. The function refuses once anything has been
// redeemed — there is no partial-refund policy yet, and it should not be
// invented in a support conversation.
router.post('/entitlements/:id/refund',
  validateBody(z.object({ reason: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const row = await callFn<{ result: any }>(
      req.user!.id,
      'select public.refund_entitlement($1,$2) as result',
      [req.params.id, req.body.reason ?? null],
    );
    res.json(row.result);
  }),
);

export default router;
