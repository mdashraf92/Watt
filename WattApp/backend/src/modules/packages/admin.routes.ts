import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/requireRole';
import { validateBody } from '../../middleware/validate';
import { callFn, query } from '../../db/pool';
import { badRequest, notFound } from '../../lib/errors';

/**
 * Venue packages — admin side. Mounted alongside the main admin router at
 * /api/admin, kept in this module so it lives with packages.routes.ts.
 *
 * Packages are deactivated, never deleted: an entitlement references the
 * package it came from, and the purchase history has to stay readable.
 */
const router = Router();
router.use(requireAuth, requireAdmin);

// Both languages are required on create — a half-translated catalog is the
// fastest way to look unfinished, and Arabic is the primary locale here.
const packageBody = z.object({
  station_id:         z.string().uuid(),
  name:               z.string().min(1),
  name_ar:            z.string().min(1),
  description:        z.string().default(''),
  description_ar:     z.string().default(''),
  partner_benefit:    z.string().min(1),
  partner_benefit_ar: z.string().min(1),
  price:              z.number().min(0),
  included_minutes:   z.number().int().positive().nullable().optional(),
  included_kwh:       z.number().positive().nullable().optional(),
  validity_hours:     z.number().int().positive().default(24),
  sort_order:         z.number().int().default(0),
});

/** A package with no cap is an open bar on someone else's electricity bill. */
function assertHasCap(v: { included_minutes?: number | null; included_kwh?: number | null }) {
  if (v.included_minutes == null && v.included_kwh == null) {
    throw badRequest('A package needs a cap: included_minutes, included_kwh, or both.');
  }
}

// Every package, active or not, with its venue.
router.get('/packages', asyncHandler(async (req, res) => {
  const stationId = req.query.station_id as string | undefined;
  const { rows } = await query(
    `select vp.*, s.name as station_name, s.name_ar as station_name_ar,
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
          included_minutes, included_kwh, validity_hours, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       returning *`,
      [b.station_id, b.name, b.name_ar, b.description, b.description_ar,
       b.partner_benefit, b.partner_benefit_ar, b.price,
       b.included_minutes ?? null, b.included_kwh ?? null, b.validity_hours, b.sort_order],
    );
    res.status(201).json(rows[0]);
  }),
);

// Partial update. Editing price or name changes only the CURRENT offer —
// entitlements already sold keep their own snapshot, by design.
router.patch('/packages/:id',
  validateBody(packageBody.partial().extend({ is_active: z.boolean().optional() })),
  asyncHandler(async (req, res) => {
    const { rows: existing } = await query(
      `select included_minutes, included_kwh from public.venue_packages where id = $1`,
      [req.params.id],
    );
    if (!existing.length) throw notFound('Package not found');

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
    const fields = Object.keys(req.body).filter(k => req.body[k] !== undefined);
    if (!fields.length) throw badRequest('Nothing to update');

    // Keys come from the Zod schema above, so they cannot be attacker-chosen.
    const sets = fields.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await query(
      `update public.venue_packages set ${sets}, updated_at = now()
        where id = $1 returning *`,
      [req.params.id, ...fields.map(k => req.body[k])],
    );
    res.json(rows[0]);
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
    `select e.*, p.name as package_name, s.name as station_name,
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
    `select e.*, p.name, p.name_ar, p.partner_benefit, p.partner_benefit_ar,
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
