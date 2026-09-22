import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error';
import { requireAuth } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { callFn, query } from '../../db/pool';

/**
 * Venue packages — the customer side.
 *
 * Phase 1 of the marketplace pivot. A Go Watt branded venue sells a bundle
 * ("coffee + 1 hour", "gym month with charging credit"); charging is an
 * included amenity, never the priced item. See sql/backend-packages.sql for
 * the model and docs/planning/pivot-ev-marketplace.md §4 for why.
 *
 * 🔴 MONEY-CRITICAL. Purchase and refund move real balance, so they go through
 * the SECURITY DEFINER SQL functions (purchase_package / redeem_entitlement)
 * rather than doing arithmetic here — the same rule the charging sessions
 * follow. Do NOT reimplement the debit in TypeScript.
 */
const router = Router();
router.use(requireAuth);

// Packages on offer at one venue. Inactive ones are never returned.
router.get('/venue/:stationId', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select id, station_id, name, name_ar, description, description_ar,
            partner_benefit, partner_benefit_ar, price,
            included_minutes, included_kwh, validity_hours, sort_order
       from public.venue_packages
      where station_id = $1 and is_active
      order by sort_order, price`,
    [req.params.stationId],
  );
  res.json(rows);
}));

// What the signed-in driver currently holds.
//
// Defaults to what is still usable, because that is what the wallet screen
// shows. `?status=all` returns the history, newest first, for the "my packages"
// list — including expired ones, which the driver should be able to see rather
// than have quietly disappear.
router.get('/mine', asyncHandler(async (req, res) => {
  const all = req.query.status === 'all';
  const { rows } = await query(
    `select e.id, e.status, e.price_paid, e.redeem_code,
            e.minutes_total, e.minutes_used, e.kwh_total, e.kwh_used,
            e.purchased_at, e.expires_at, e.consumed_at,
            p.name as package_name, p.name_ar as package_name_ar,
            p.partner_benefit, p.partner_benefit_ar,
            s.name as station_name, s.name_ar as station_name_ar, s.address
       from public.entitlements e
       join public.venue_packages p on p.id = e.package_id
       join public.stations s on s.id = e.station_id
      where e.user_id = $1
        and ($2::boolean or (e.status = 'active' and e.expires_at > now()))
      order by e.purchased_at desc`,
    [req.user!.id, all],
  );
  res.json(rows);
}));

// Buy a package. Debits the wallet and issues the entitlement in one
// transaction; returns { entitlement, balance } so the client needs no
// follow-up read of the balance.
router.post('/purchase',
  validateBody(z.object({ package_id: z.string().uuid() })),
  asyncHandler(async (req, res) => {
    const row = await callFn<{ result: any }>(
      req.user!.id,
      'select public.purchase_package($1) as result',
      [req.body.package_id],
    );
    res.status(201).json(row.result);
  }),
);

// Record a use of an entitlement against a charging session.
//
// Called by the holder or by staff acting for the venue (the function enforces
// that). Consumption is clamped to what remains — an overrun is absorbed, not
// billed, until there is a commercial decision about overruns.
router.post('/entitlements/:id/redeem',
  validateBody(z.object({
    session_id: z.string().uuid().nullable().optional(),
    minutes:    z.number().int().min(0).optional(),
    kwh:        z.number().min(0).optional(),
  })),
  asyncHandler(async (req, res) => {
    const row = await callFn<{ result: any }>(
      req.user!.id,
      'select public.redeem_entitlement($1,$2,$3,$4) as result',
      [
        req.params.id,
        req.body.session_id ?? null,
        req.body.minutes ?? 0,
        req.body.kwh ?? 0,
      ],
    );
    res.json(row.result);
  }),
);

export default router;
